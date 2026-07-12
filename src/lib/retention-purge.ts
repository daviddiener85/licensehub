import { rm } from "node:fs/promises";
import path from "node:path";

import { ApplicationStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const terminalStatuses = [ApplicationStatus.DISPATCHED, ApplicationStatus.CANCELLED] as const;
const knownUploadFolders = ["client-documents", "admin-documents", "mandate-forms"] as const;

type PurgeOptions = {
  dryRun?: boolean;
  limit?: number;
  applicationIds?: string[];
  now?: Date;
};

type PurgeSummary = {
  dryRun: boolean;
  eligible: number;
  databaseDeleted: number;
  filesDeleted: number;
  clientsDeleted: number;
  pendingFileRetries: number;
  applicationIds: string[];
  errors: Array<{ applicationId: string; message: string }>;
};

function normalizedBatchSize(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 25;
  }

  return Math.max(1, Math.min(100, Math.floor(value ?? 25)));
}

function relativeUploadPath(storageKey: string) {
  const relative = storageKey.replace(/^\/+uploads\/?/, "").replace(/^\/+/, "");

  if (!relative || relative === "." || path.isAbsolute(relative)) {
    return null;
  }

  const normalized = path.normalize(relative);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    return null;
  }

  return normalized;
}

export function storagePathsForApplication(
  applicationId: string,
  documentStorageKeys: string[],
  mandateStorageKey: string | null,
) {
  const paths = new Set<string>(knownUploadFolders.map((folder) => path.join(folder, applicationId)));

  for (const storageKey of [...documentStorageKeys, mandateStorageKey].filter((value): value is string => Boolean(value))) {
    const relative = relativeUploadPath(storageKey);
    if (relative) {
      paths.add(relative);
    }
  }

  return [...paths].sort();
}

function absoluteUploadPath(relativePath: string) {
  const uploadRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads");
  const absolute = path.resolve(uploadRoot, relativePath);

  if (!absolute.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new Error(`Unsafe retention storage path: ${relativePath}`);
  }

  return absolute;
}

function jsonStoragePaths(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export async function deleteQueuedFiles(record: { id: string; applicationId: string; storagePaths: Prisma.JsonValue }) {
  try {
    for (const relativePath of jsonStoragePaths(record.storagePaths)) {
      await rm(absoluteUploadPath(relativePath), { recursive: true, force: true });
    }

    await prisma.retentionPurge.delete({ where: { id: record.id } });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown retention file deletion error";
    await prisma.retentionPurge.update({
      where: { id: record.id },
      data: { lastError: message },
    });
    return false;
  }
}

export async function runRetentionPurge(options: PurgeOptions = {}): Promise<PurgeSummary> {
  const dryRun = options.dryRun ?? false;
  const limit = normalizedBatchSize(options.limit);
  const now = options.now ?? new Date();
  const requestedIds = options.applicationIds?.filter(Boolean);
  const errors: PurgeSummary["errors"] = [];
  let databaseDeleted = 0;
  let filesDeleted = 0;
  let clientsDeleted = 0;

  const pendingFileRecords = await prisma.retentionPurge.findMany({
    where: requestedIds?.length ? { applicationId: { in: requestedIds } } : undefined,
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, applicationId: true, storagePaths: true },
  });

  if (!dryRun) {
    for (const record of pendingFileRecords) {
      if (await deleteQueuedFiles(record)) {
        filesDeleted += 1;
      } else {
        errors.push({ applicationId: record.applicationId, message: "Stored files could not be deleted; retry queued." });
      }
    }
  }

  const applications = await prisma.application.findMany({
    where: {
      currentStatus: { in: [...terminalStatuses] },
      retentionEligibleAt: { not: null, lte: now },
      ...(requestedIds?.length ? { id: { in: requestedIds } } : {}),
    },
    orderBy: { retentionEligibleAt: "asc" },
    take: limit,
    select: {
      id: true,
      clientId: true,
      documents: { select: { storageKey: true } },
      mandateFormSubmission: { select: { idPhotoStorageKey: true } },
    },
  });

  if (dryRun) {
    return {
      dryRun,
      eligible: applications.length,
      databaseDeleted,
      filesDeleted,
      clientsDeleted,
      pendingFileRetries: pendingFileRecords.length,
      applicationIds: applications.map((application) => application.id),
      errors,
    };
  }

  for (const application of applications) {
    const storagePaths = storagePathsForApplication(
      application.id,
      application.documents.map((document) => document.storageKey),
      application.mandateFormSubmission?.idPhotoStorageKey ?? null,
    );

    try {
      const result = await prisma.$transaction(async (transaction) => {
        await transaction.retentionPurge.create({
          data: {
            applicationId: application.id,
            clientId: application.clientId,
            storagePaths,
          },
        });

        await transaction.auditLog.deleteMany({ where: { applicationId: application.id } });
        const deletedApplication = await transaction.application.deleteMany({
          where: {
            id: application.id,
            currentStatus: { in: [...terminalStatuses] },
            retentionEligibleAt: { not: null, lte: now },
          },
        });

        if (deletedApplication.count !== 1) {
          throw new Error("Application was no longer eligible when deletion began.");
        }

        const deletedClient = await transaction.client.deleteMany({
          where: {
            id: application.clientId,
            applications: { none: {} },
          },
        });

        return { clientDeleted: deletedClient.count === 1 };
      });

      databaseDeleted += 1;
      if (result.clientDeleted) {
        clientsDeleted += 1;
      }

      const queuedRecord = await prisma.retentionPurge.findUniqueOrThrow({
        where: { applicationId: application.id },
        select: { id: true, applicationId: true, storagePaths: true },
      });

      if (await deleteQueuedFiles(queuedRecord)) {
        filesDeleted += 1;
      } else {
        errors.push({ applicationId: application.id, message: "Database deleted; file deletion queued for retry." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown retention purge error";
      errors.push({ applicationId: application.id, message });
    }
  }

  return {
    dryRun,
    eligible: applications.length,
    databaseDeleted,
    filesDeleted,
    clientsDeleted,
    pendingFileRetries: await prisma.retentionPurge.count(),
    applicationIds: applications.map((application) => application.id),
    errors,
  };
}

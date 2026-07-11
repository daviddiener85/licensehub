import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ApplicationStatus, ClientEntityType, DocumentStatus, DocumentType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { runRetentionPurge } from "@/lib/retention-purge";

async function main() {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const applicationId = `RETENTION-${stamp}`;
  const clientHash = createHash("sha256").update(applicationId).digest("hex");
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "client-documents", applicationId);
  const uploadPath = path.join(uploadDirectory, "retention-test.pdf");
  let clientId = "";

  try {
    const service = await prisma.service.findFirst({ orderBy: { createdAt: "asc" } });
    if (!service) {
      throw new Error("A service is required for the retention regression test.");
    }

    const client = await prisma.client.create({
      data: {
        entityType: ClientEntityType.PRIVATE_OWNER,
        firstName: "Retention",
        surname: "Regression",
        southAfricanIdEncrypted: `retention-test-${stamp}`,
        southAfricanIdHash: clientHash,
        cellphone: "0800000000",
        email: `retention-${stamp}@example.com`,
        deliveryAddressLine1: "1 Test Street",
        deliveryCity: "Johannesburg",
        deliveryPostalCode: "2000",
        popiaConsentAcceptedAt: new Date(),
      },
    });
    clientId = client.id;

    await prisma.application.create({
      data: {
        id: applicationId,
        publicToken: randomUUID(),
        clientId,
        serviceId: service.id,
        currentStatus: ApplicationStatus.CANCELLED,
        cancelledAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        retentionEligibleAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(uploadPath, "retention purge regression");
    await prisma.document.create({
      data: {
        applicationId,
        type: DocumentType.OTHER,
        status: DocumentStatus.ACCEPTED,
        version: 1,
        fileName: "retention-test.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 26,
        storageKey: `/uploads/client-documents/${applicationId}/retention-test.pdf`,
      },
    });
    await prisma.auditLog.create({
      data: {
        applicationId,
        action: "RETENTION_TEST",
        entityType: "Application",
        entityId: applicationId,
      },
    });

    const summary = await runRetentionPurge({ applicationIds: [applicationId], limit: 1 });
    const [application, retainedClient, auditCount, queueCount] = await Promise.all([
      prisma.application.findUnique({ where: { id: applicationId } }),
      prisma.client.findUnique({ where: { id: clientId } }),
      prisma.auditLog.count({ where: { applicationId } }),
      prisma.retentionPurge.count({ where: { applicationId } }),
    ]);

    if (summary.databaseDeleted !== 1 || summary.filesDeleted !== 1 || summary.clientsDeleted !== 1) {
      throw new Error(`Unexpected purge summary: ${JSON.stringify(summary)}`);
    }
    if (application || retainedClient || auditCount !== 0 || queueCount !== 0 || existsSync(uploadDirectory)) {
      throw new Error("Retention purge did not remove every expected database and file artifact.");
    }

    console.log(JSON.stringify({ ok: true, applicationId, summary }));
  } finally {
    await prisma.auditLog.deleteMany({ where: { applicationId } }).catch(() => undefined);
    await prisma.application.deleteMany({ where: { id: applicationId } }).catch(() => undefined);
    await prisma.retentionPurge.deleteMany({ where: { applicationId } }).catch(() => undefined);
    if (clientId) {
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => undefined);
    }
    await rm(uploadDirectory, { recursive: true, force: true });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

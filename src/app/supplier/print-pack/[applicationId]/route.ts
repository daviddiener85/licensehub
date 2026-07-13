import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

import { DocumentStatus, DocumentType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { documentLabel } from "@/lib/documents";
import { supportingRequirementForDocument } from "@/lib/entity-requirements";

export const dynamic = "force-dynamic";

function storageKeyPath(storageKey: string) {
  const uploadRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads");
  const relativePath = storageKey.replace(/^\/uploads\/?/, "");
  const filePath = path.normalize(path.join(uploadRoot, relativePath));

  if (!filePath.startsWith(uploadRoot + path.sep)) {
    return null;
  }

  return filePath;
}

async function addPlaceholderPage(pdf: PDFDocument, title: string, message: string) {
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText(title, {
    x: 42,
    y: 770,
    size: 18,
    font: boldFont,
    color: rgb(0.07, 0.09, 0.12),
  });
  page.drawText(message, {
    x: 42,
    y: 735,
    size: 11,
    font,
    color: rgb(0.34, 0.4, 0.38),
  });
}

async function addImagePage(pdf: PDFDocument, bytes: Uint8Array, title: string) {
  const orientedImage = await sharp(bytes).rotate().jpeg({ quality: 92 }).toBuffer();
  const image = await pdf.embedJpg(orientedImage);
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 36;
  const titleHeight = 26;
  const maxWidth = page.getWidth() - margin * 2;
  const maxHeight = page.getHeight() - margin * 2 - titleHeight;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  page.drawText(title, {
    x: margin,
    y: page.getHeight() - margin - 12,
    size: 12,
    font,
    color: rgb(0.07, 0.09, 0.12),
  });
  page.drawImage(image, {
    x: (page.getWidth() - width) / 2,
    y: margin,
    width,
    height,
  });
}

export async function GET(_request: Request, context: RouteContext<"/supplier/print-pack/[applicationId]">) {
  const { applicationId } = await context.params;
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      service: { select: { slug: true } },
      client: { select: { entityType: true } },
      documents: {
        where: {
          status: DocumentStatus.ACCEPTED,
          type: { not: DocumentType.PROOF_OF_EFT_PAYMENT },
        },
        orderBy: [{ type: "asc" }, { version: "asc" }],
        select: {
          id: true,
          fileName: true,
          storageKey: true,
          type: true,
          version: true,
          requirementKey: true,
        },
      },
    },
  });

  if (!application) {
    return new Response("Not found", { status: 404 });
  }

  const outputPdf = await PDFDocument.create();

  for (const document of application.documents) {
    if (!document.storageKey) {
      continue;
    }

    const filePath = storageKeyPath(document.storageKey);
    const label =
      document.type === DocumentType.OTHER
        ? supportingRequirementForDocument(
            document,
            application.client.entityType,
            application.documents,
            application.service.slug,
          )?.label ??
          documentLabel(document.type, document.fileName)
        : documentLabel(document.type, document.fileName);

    if (!filePath) {
      await addPlaceholderPage(outputPdf, label, "This document could not be loaded for printing.");
      continue;
    }

    try {
      const bytes = await readFile(filePath);
      const extension = path.extname(filePath).toLowerCase();

      if (extension === ".pdf") {
        const sourcePdf = await PDFDocument.load(bytes);
        const pages = await outputPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        pages.forEach((page) => outputPdf.addPage(page));
        continue;
      }

      if (extension === ".jpg" || extension === ".jpeg" || extension === ".png") {
        await addImagePage(outputPdf, bytes, label);
        continue;
      }

      await addPlaceholderPage(outputPdf, label, "Open this document separately. This file type cannot be merged into the print pack.");
    } catch (error) {
      const missingFile =
        typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
      await addPlaceholderPage(
        outputPdf,
        label,
        missingFile
          ? "This document file is missing from storage. Ask The License Hub to re-upload it."
          : "This document could not be rendered. Ask The License Hub to re-upload it as a JPG, PNG, or PDF.",
      );
    }
  }

  if (outputPdf.getPageCount() === 0) {
    await addPlaceholderPage(outputPdf, `Print pack ${application.id}`, "No accepted printable documents are available.");
  }

  const pdfBytes = await outputPdf.save();

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Cache-Control": "private, max-age=0, must-revalidate",
      "Content-Disposition": `inline; filename="${application.id}-print-pack.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}

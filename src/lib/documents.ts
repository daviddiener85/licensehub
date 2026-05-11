import { DocumentType } from "@/generated/prisma/client";

export const documentTypeLabels: Record<DocumentType, string> = {
  [DocumentType.LICENCE_DISK_PHOTO]: "Licence disk photo",
  [DocumentType.PROOF_OF_ADDRESS]: "Proof of address",
  [DocumentType.MANDATE_LETTER]: "Legacy mandate letter",
  [DocumentType.MANDATE_FORM]: "Completed mandate form",
  [DocumentType.PROOF_OF_EFT_PAYMENT]: "Proof of EFT payment",
  [DocumentType.OTHER]: "Other document",
};

export const documentTypeDescriptions: Partial<Record<DocumentType, string>> = {
  [DocumentType.MANDATE_FORM]: "Auto-populated signed PDF with client signature and ID photo embedded.",
  [DocumentType.MANDATE_LETTER]: "Legacy handwritten mandate letter retained for historical records only.",
};

export function documentLabel(type: DocumentType, fallback: string) {
  return documentTypeLabels[type] ?? formatDocumentName(fallback);
}

export function documentHref(storageKey: string) {
  return storageKey.startsWith("/uploads/") ? storageKey : null;
}

export function formatDocumentName(fileName: string) {
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, "");

  return nameWithoutExtension
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => {
      const normalizedWord = word.toLowerCase() === "licence" ? "license" : word;
      return normalizedWord.charAt(0).toUpperCase() + normalizedWord.slice(1).toLowerCase();
    })
    .join(" ");
}

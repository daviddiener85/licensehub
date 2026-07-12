import { DocumentStatus } from "@/generated/prisma/client";

export const supplierReturnEvidenceRequirementKeys = {
  producedDocumentPhoto: "supplier-produced-document-photo",
  barcodePhoto: "supplier-barcode-photo",
} as const;

export const supplierReturnEvidenceLabels: Record<string, string> = {
  [supplierReturnEvidenceRequirementKeys.producedDocumentPhoto]: "Produced document photo",
  [supplierReturnEvidenceRequirementKeys.barcodePhoto]: "Barcode photo",
};

export const supplierReturnEvidenceDescriptions: Record<string, string> = {
  [supplierReturnEvidenceRequirementKeys.producedDocumentPhoto]:
    "Photo of the produced document before it is returned to The License Hub.",
  [supplierReturnEvidenceRequirementKeys.barcodePhoto]: "Photo of the barcode on the produced document.",
};

export function isSupplierReturnEvidenceRequirementKey(requirementKey: string | null | undefined) {
  return Object.values(supplierReturnEvidenceRequirementKeys).includes(requirementKey as (typeof supplierReturnEvidenceRequirementKeys)[keyof typeof supplierReturnEvidenceRequirementKeys]);
}

export function isSupplierReturnEvidenceDocument<T extends { requirementKey: string | null }>(document: T) {
  return isSupplierReturnEvidenceRequirementKey(document.requirementKey);
}

export function supplierReturnEvidenceLabel(requirementKey: string | null | undefined, fallback: string) {
  if (requirementKey && requirementKey in supplierReturnEvidenceLabels) {
    return supplierReturnEvidenceLabels[requirementKey];
  }

  return fallback;
}

export function supplierReturnEvidenceDocuments<T extends { requirementKey: string | null }>(documents: T[]) {
  return documents.filter((document) => isSupplierReturnEvidenceDocument(document));
}

export function hasSupplierReturnEvidence<T extends { requirementKey: string | null; status?: DocumentStatus }>(
  documents: T[],
) {
  const keys = new Set(
    supplierReturnEvidenceDocuments(documents)
      .filter((document) => document.status === undefined || document.status === DocumentStatus.ACCEPTED)
      .map((document) => document.requirementKey)
      .filter((value): value is string => Boolean(value)),
  );

  return Object.values(supplierReturnEvidenceRequirementKeys).every((key) => keys.has(key));
}

export function producedDocumentEvidence<
  T extends { requirementKey: string | null; storageKey: string | null; status?: DocumentStatus },
>(documents: T[]) {
  return documents.find(
    (document) =>
      document.requirementKey === supplierReturnEvidenceRequirementKeys.producedDocumentPhoto &&
      (document.status === undefined || document.status === DocumentStatus.ACCEPTED),
  );
}

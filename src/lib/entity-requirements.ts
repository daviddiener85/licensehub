import { ClientEntityType, DocumentType } from "@/generated/prisma/client";

export const clientEntityTypeLabels: Record<ClientEntityType, string> = {
  [ClientEntityType.PRIVATE_OWNER]: "Private owner",
  [ClientEntityType.DECEASED_ESTATE]: "Deceased estate",
  [ClientEntityType.COMPANY_OR_TRUST]: "Company or trust",
  [ClientEntityType.NON_SA_CITIZEN]: "Non-SA citizen",
};

export type EntityDocumentRequirement = {
  key: string;
  label: string;
  description: string;
  documentType?: DocumentType;
  confirmedForUpload: boolean;
};

type ServiceSupportingRequirement = {
  key: string;
  label: string;
  description: string;
};

const baseRequirements: EntityDocumentRequirement[] = [
  {
    key: "id-photo",
    label: "ID photo",
    description: "Captured with the mandate form and embedded in the traffic-department PDF.",
    documentType: DocumentType.ID_PHOTO,
    confirmedForUpload: true,
  },
  {
    key: "licence-disk",
    label: "Licence disk photo",
    description: "JPG or PNG with the registration details visible.",
    documentType: DocumentType.LICENCE_DISK_PHOTO,
    confirmedForUpload: true,
  },
  {
    key: "proof-of-address",
    label: "Proof of address",
    description: "JPG, PNG, or PDF dated within the last 3 months.",
    documentType: DocumentType.PROOF_OF_ADDRESS,
    confirmedForUpload: true,
  },
  {
    key: "mandate-form",
    label: "Completed mandate form",
    description: "Generated after the client signs on the phone.",
    documentType: DocumentType.MANDATE_FORM,
    confirmedForUpload: true,
  },
];

const requirementsByEntityType: Record<ClientEntityType, EntityDocumentRequirement[]> = {
  [ClientEntityType.PRIVATE_OWNER]: baseRequirements,
  [ClientEntityType.DECEASED_ESTATE]: [
    ...baseRequirements,
    {
      key: "death-certificate",
      label: "Death certificate",
      description: "Official death certificate for the registered owner.",
      confirmedForUpload: true,
    },
    {
      key: "executor-authority",
      label: "Executor authority document",
      description: "Letter of executorship or authority document for the estate representative.",
      confirmedForUpload: true,
    },
  ],
  [ClientEntityType.COMPANY_OR_TRUST]: [
    ...baseRequirements,
    {
      key: "registration-or-trust-document",
      label: "Company or trust registration document",
      description: "Company registration, trust deed, or equivalent entity document.",
      confirmedForUpload: true,
    },
    {
      key: "representative-authority",
      label: "Representative authority",
      description: "Resolution or authority letter for the person signing on behalf of the entity.",
      confirmedForUpload: true,
    },
  ],
  [ClientEntityType.NON_SA_CITIZEN]: [
    ...baseRequirements,
    {
      key: "traffic-register-document",
      label: "Traffic register document (TRN)",
      description: "Traffic register document required for non-SA citizen production handling.",
      confirmedForUpload: true,
    },
    {
      key: "passport-document",
      label: "Passport document",
      description: "Passport document required for non-SA citizen production handling.",
      confirmedForUpload: true,
    },
  ],
};

const supportingRequirementsByServiceSlug: Record<string, ServiceSupportingRequirement[]> = {
  "change-of-ownership": [
    {
      key: "rc1",
      label: "Registration document (Original RC1)",
      description: "Original vehicle registration document provided for the ownership transfer.",
    },
    {
      key: "current-owner-id",
      label: "Current owner ID",
      description: "Identification document supplied for the current owner.",
    },
    {
      key: "current-owner-proof-of-address",
      label: "Current owner proof of address",
      description: "Must not be older than three months.",
    },
    {
      key: "new-owner-id",
      label: "New owner ID",
      description: "Identification document supplied for the new owner.",
    },
    {
      key: "new-owner-proof-of-address",
      label: "New owner proof of address",
      description: "Must not be older than three months.",
    },
  ],
};

const changeOfOwnershipDocumentRequirements: EntityDocumentRequirement[] = [
  {
    key: "rc1",
    label: "Registration document (Original RC1)",
    description: "Original vehicle registration document provided for the ownership transfer.",
    confirmedForUpload: true,
  },
  {
    key: "licence-disk",
    label: "Licence disk photo",
    description: "JPG or PNG with the registration details visible.",
    documentType: DocumentType.LICENCE_DISK_PHOTO,
    confirmedForUpload: true,
  },
  {
    key: "current-owner-id",
    label: "Current owner ID",
    description: "Identification document supplied for the current owner.",
    confirmedForUpload: true,
  },
  {
    key: "current-owner-proof-of-address",
    label: "Current owner proof of address",
    description: "Must not be older than three months.",
    confirmedForUpload: true,
  },
  {
    key: "new-owner-id",
    label: "New owner ID",
    description: "Identification document supplied for the new owner.",
    confirmedForUpload: true,
  },
  {
    key: "new-owner-proof-of-address",
    label: "New owner proof of address",
    description: "Must not be older than three months.",
    confirmedForUpload: true,
  },
  {
    key: "id-photo",
    label: "ID photo",
    description: "Captured with the mandate form and embedded in the traffic-department PDF.",
    documentType: DocumentType.ID_PHOTO,
    confirmedForUpload: true,
  },
  {
    key: "mandate-form",
    label: "Completed mandate form",
    description: "Generated after the client signs on the phone.",
    documentType: DocumentType.MANDATE_FORM,
    confirmedForUpload: true,
  },
];

export function documentRequirementsForEntityType(entityType: ClientEntityType) {
  return requirementsByEntityType[entityType] ?? requirementsByEntityType.PRIVATE_OWNER;
}

export function documentRequirementsForApplication(
  serviceSlug: string | null | undefined,
  entityType: ClientEntityType,
) {
  if (serviceSlug === "change-of-ownership") {
    return changeOfOwnershipDocumentRequirements;
  }

  return documentRequirementsForEntityType(entityType);
}

export function supportingRequirementsForEntityType(entityType: ClientEntityType) {
  return documentRequirementsForEntityType(entityType).filter(
    (requirement) => requirement.confirmedForUpload && !requirement.documentType,
  );
}

export function supportingRequirementLabel(
  key: string,
  entityType: ClientEntityType,
  serviceSlug?: string | null,
) {
  const serviceRequirement = serviceSlug ? supportingRequirementsByServiceSlug[serviceSlug]?.find((requirement) => requirement.key === key) : undefined;

  if (serviceRequirement) {
    return serviceRequirement.label;
  }

  return supportingRequirementsForEntityType(entityType).find((requirement) => requirement.key === key)?.label ?? null;
}

export function supportingRequirementsForService(
  entityType: ClientEntityType,
  serviceSlug?: string | null,
) {
  const serviceRequirements = serviceSlug ? supportingRequirementsByServiceSlug[serviceSlug] ?? [] : [];

  return [...supportingRequirementsForEntityType(entityType), ...serviceRequirements].filter(
    (requirement, index, requirements) => requirements.findIndex((candidate) => candidate.key === requirement.key) === index,
  );
}

type SupportingDocumentRecord = {
  id: string;
  type: DocumentType;
  version: number;
  requirementKey?: string | null;
};

export function supportingDocumentForRequirement<T extends SupportingDocumentRecord>(
  requirementKey: string,
  entityType: ClientEntityType,
  documents: T[],
) {
  const supportingDocuments = documents
    .filter((document) => document.type === DocumentType.OTHER)
    .sort((first, second) => first.version - second.version);
  const keyedDocument = [...supportingDocuments]
    .reverse()
    .find((document) => document.requirementKey === requirementKey);

  if (keyedDocument) {
    return keyedDocument;
  }

  const requirements = supportingRequirementsForEntityType(entityType);
  const legacyDocuments = supportingDocuments.filter((document) => !document.requirementKey);
  const activeLegacyDocuments = legacyDocuments.slice(-requirements.length);
  const requirementIndex = requirements.findIndex((requirement) => requirement.key === requirementKey);

  return requirementIndex >= 0 ? activeLegacyDocuments[requirementIndex] : undefined;
}

export function supportingRequirementForDocument<T extends SupportingDocumentRecord>(
  document: T,
  entityType: ClientEntityType,
  documents: T[],
  serviceSlug?: string | null,
) {
  const requirements = supportingRequirementsForEntityType(entityType);

  if (serviceSlug) {
    const serviceRequirement = supportingRequirementsByServiceSlug[serviceSlug]?.find(
      (requirement) => requirement.key === document.requirementKey,
    );

    if (serviceRequirement && document.requirementKey) {
      return serviceRequirement;
    }
  }

  if (document.requirementKey) {
    return requirements.find((requirement) => requirement.key === document.requirementKey);
  }

  return requirements.find(
    (requirement) => supportingDocumentForRequirement(requirement.key, entityType, documents)?.id === document.id,
  );
}

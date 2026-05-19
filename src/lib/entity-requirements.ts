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

const baseRequirements: EntityDocumentRequirement[] = [
  {
    key: "id-photo",
    label: "ID photo",
    description: "Captured with the mandate form and embedded in the traffic-department PDF.",
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
      key: "executor-authority",
      label: "Executor authority document",
      description: "Letter of executorship or authority document for the estate representative.",
      confirmedForUpload: false,
    },
    {
      key: "death-certificate",
      label: "Death certificate",
      description: "Estate supporting document to be confirmed in the final document list.",
      confirmedForUpload: false,
    },
  ],
  [ClientEntityType.COMPANY_OR_TRUST]: [
    ...baseRequirements,
    {
      key: "registration-or-trust-document",
      label: "Company or trust registration document",
      description: "Company registration, trust deed, or equivalent entity document.",
      confirmedForUpload: false,
    },
    {
      key: "representative-authority",
      label: "Representative authority",
      description: "Resolution or authority letter for the person signing on behalf of the entity.",
      confirmedForUpload: false,
    },
  ],
  [ClientEntityType.NON_SA_CITIZEN]: [
    ...baseRequirements,
    {
      key: "passport-or-traffic-register",
      label: "Passport or traffic register document",
      description: "Non-SA citizen identity document to be confirmed for production handling.",
      confirmedForUpload: false,
    },
  ],
};

export function documentRequirementsForEntityType(entityType: ClientEntityType) {
  return requirementsByEntityType[entityType] ?? requirementsByEntityType.PRIVATE_OWNER;
}

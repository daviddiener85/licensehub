export const applicationPipeline = [
  {
    key: "draft",
    status: "DRAFT",
    label: "Draft",
    owner: "Client",
    clientDescription: "Your application has been started. Complete all steps and payment to submit.",
  },
  {
    key: "pending-review",
    status: "PENDING_REVIEW",
    label: "Pending Review",
    owner: "System",
    clientDescription: "Your application has been received and is being reviewed by our team.",
  },
  {
    key: "documents-resubmit-required",
    status: "DOCUMENTS_RESUBMIT_REQUIRED",
    label: "Documents Resubmit Required",
    owner: "Admin",
    clientDescription: "One or more documents need to be resubmitted. See the request details below.",
  },
  {
    key: "additional-charge-raised",
    status: "ADDITIONAL_CHARGE_RAISED",
    label: "Additional Charge Raised",
    owner: "Admin",
    clientDescription: "An additional charge has been added. Please review and pay.",
  },
  {
    key: "approved",
    status: "APPROVED",
    label: "Approved",
    owner: "Admin",
    clientDescription: "Your application has been approved and sent to our processing partner.",
  },
  {
    key: "at-supplier",
    status: "AT_SUPPLIER",
    label: "At Supplier",
    owner: "Admin",
    clientDescription: "Your application is with our processing partner.",
  },
  {
    key: "supplier-produced",
    status: "SUPPLIER_PRODUCED",
    label: "Supplier Produced",
    owner: "Supplier",
    clientDescription: "Your document has been produced by our partner.",
  },
  {
    key: "returning-to-license-hub",
    status: "RETURNING_TO_LICENSE_HUB",
    label: "Returning to License Hub",
    owner: "Supplier",
    clientDescription: "Your document is on its way back to License Hub.",
  },
  {
    key: "document-returned",
    status: "DOCUMENT_RETURNED",
    label: "Document Returned",
    owner: "Admin",
    clientDescription: "Your document has been received back at License Hub.",
  },
  {
    key: "dispatched",
    status: "DISPATCHED",
    label: "Dispatched",
    owner: "Admin",
    clientDescription: "Complete. Your document has been dispatched. Tracking details are available below.",
  },
  {
    key: "cancelled",
    status: "CANCELLED",
    label: "Cancelled",
    owner: "Admin",
    clientDescription: "This application has been cancelled.",
  },
] as const;

export const supplierStatusActions = [
  {
    status: "SUPPLIER_PRODUCED",
    label: "Produced",
    effect: "Admin dashboard updates in real time. No client notification is sent at this stage.",
  },
  {
    status: "RETURNING_TO_LICENSE_HUB",
    label: "Returning to License Hub",
    effect: "Admin is notified immediately and the client status reflects the return leg.",
  },
] as const;

export const buildModules = [
  {
    title: "Client Portal",
    description: "Unique-link profile creation, service selection, document upload, payment, and status tracking.",
    status: "Foundation next",
  },
  {
    title: "Admin Workspace",
    description: "Document review, EFT confirmation, charges, approvals, document return, dispatch, retention, and audit history.",
    status: "Core workflow",
  },
  {
    title: "Supplier Portal",
    description: "Approved order queue with print-ready packs and only Produced or Returning to License Hub status actions.",
    status: "Restricted access",
  },
  {
    title: "Integrations",
    description: "Paystack, SMS, email, OCR, private file storage, and retention automation.",
    status: "Stub first",
  },
] as const;

export const whatsappTemplates = [
  {
    key: "resubmit-proof-of-address",
    label: "Resubmit proof of address",
    body: "Hi {{firstName}}, your proof of address for application {{applicationId}} needs to be updated because it is older than 3 months.\n\nPlease upload a newer document to continue.\n\nThanks,\nThe License Hub",
  },
  {
    key: "payment-reminder",
    label: "Payment reminder",
    body: "Hi {{firstName}}, payment for application {{applicationId}} is still waiting for confirmation.\n\nPlease complete payment to continue.\n\nThanks,\nThe License Hub",
  },
  {
    key: "dispatch-update",
    label: "Dispatch update",
    body: "Hi {{firstName}}, your document has been dispatched.\n\nTracking details are available on your status page.\n\nThanks,\nThe License Hub",
  },
] as const;

export type WhatsAppTemplateKey = (typeof whatsappTemplates)[number]["key"];

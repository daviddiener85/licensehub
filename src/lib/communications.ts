export const whatsappTemplates = [
  {
    key: "resubmit-proof-of-address",
    label: "Resubmit proof of address",
    body: "Hi {{firstName}}, your proof of address for {{applicationId}} is older than 3 months. Please upload a newer document using your License Hub link.",
  },
  {
    key: "payment-reminder",
    label: "Payment reminder",
    body: "Hi {{firstName}}, your License Hub application {{applicationId}} is waiting for payment confirmation. Please complete payment using your application link.",
  },
  {
    key: "dispatch-update",
    label: "Dispatch update",
    body: "Hi {{firstName}}, your document has been dispatched. Tracking details are available on your License Hub status page.",
  },
] as const;

export type WhatsAppTemplateKey = (typeof whatsappTemplates)[number]["key"];

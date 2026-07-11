export const whatsappTemplates = [
  {
    key: "application_received",
    label: "Application received",
    body: "Hi {{firstName}},\n\nYour new application has been created successfully.\n\nPlease view {{trackingUrl}} for any update.",
  },
  {
    key: "order_update",
    label: "Order update",
    body: "Hello {{firstName}},\n\nWe updated your order {{applicationId}}. Please view your tracking page for an update: {{trackingUrl}}.\n\nThank you for supporting us!",
  },
] as const;

export type WhatsAppTemplateKey = (typeof whatsappTemplates)[number]["key"];

import { createDecipheriv } from "node:crypto";

const encryptedIdPrefix = "lh-id:v1:";
const demoIdLabels: Record<string, string> = {
  "encrypted-demo-id-hash-mia": "1234567890123",
  "encrypted-demo-id-hash-aiden": "1234567890123",
  "encrypted-demo-id-hash-thando": "1234567890123",
  "encrypted-demo-id-hash-leila": "1234567890123",
};

function maskSouthAfricanId(idNumber: string) {
  if (!/^\d{13}$/.test(idNumber)) {
    return "ID securely on file";
  }

  return `${idNumber.slice(0, 6)} **** ${idNumber.slice(10)}`;
}

function decryptSouthAfricanId(encryptedValue: string) {
  const key = process.env.CLIENT_ID_ENCRYPTION_KEY;

  if (!key || !encryptedValue.startsWith(encryptedIdPrefix)) {
    return null;
  }

  const [, , ivBase64, tagBase64, ciphertextBase64] = encryptedValue.split(":");

  if (!ivBase64 || !tagBase64 || !ciphertextBase64) {
    return null;
  }

  const keyBytes = Buffer.from(key, "base64");

  if (keyBytes.length !== 32) {
    return null;
  }

  const decipher = createDecipheriv("aes-256-gcm", keyBytes, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function clientIdPreviewLabel(southAfricanIdEncrypted: string) {
  const decryptedId = decryptSouthAfricanId(southAfricanIdEncrypted);

  if (decryptedId) {
    return maskSouthAfricanId(decryptedId);
  }

  return demoIdLabels[southAfricanIdEncrypted] ?? "ID securely on file";
}

export function clientIdMandatePdfLabel(southAfricanIdEncrypted: string) {
  const decryptedId = decryptSouthAfricanId(southAfricanIdEncrypted);

  if (decryptedId) {
    return decryptedId;
  }

  return demoIdLabels[southAfricanIdEncrypted] ?? "ID securely on file";
}

export function clientIdSecurityNote(southAfricanIdEncrypted: string) {
  if (decryptSouthAfricanId(southAfricanIdEncrypted)) {
    return "Full ID number was resolved server-side for this generated PDF and was not sent to the browser preview.";
  }

  return "Full ID number remains encrypted/unavailable in this environment; configure CLIENT_ID_ENCRYPTION_KEY for production PDF population.";
}

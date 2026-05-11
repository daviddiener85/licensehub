import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type MandatePdfInput = {
  clientName: string;
  clientIdLabel: string;
  date: Date;
  registrationNumber: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  signatureDataUrl: string;
  idPhotoBytes: Buffer;
  idPhotoMimeType: string;
};

const navy = rgb(0.03, 0.18, 0.35);
const lightBlue = rgb(0.93, 0.97, 1);
const red = rgb(0.82, 0.06, 0.05);
const ink = rgb(0.07, 0.09, 0.12);
const muted = rgb(0.32, 0.38, 0.36);

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function valueOrLine(value: string | null) {
  return value?.trim() || "To be confirmed";
}

function dataUrlBytes(dataUrl: string) {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

function drawText(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = ink) {
  page.drawText(text, { x, y, size, font, color });
}

function drawCenteredText(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = ink) {
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (page.getWidth() - textWidth) / 2,
    y,
    size,
    font,
    color,
  });
}

function drawField(page: PDFPage, value: string, x: number, y: number, width: number, font: PDFFont) {
  page.drawLine({
    start: { x, y: y - 3 },
    end: { x: x + width, y: y - 3 },
    thickness: 0.8,
    color: ink,
  });
  page.drawText(value, {
    x: x + 4,
    y,
    size: 10,
    font,
    color: ink,
    maxWidth: width - 8,
  });
}

function drawDottedField(page: PDFPage, value: string, x: number, y: number, width: number, font: PDFFont) {
  let dotX = x;

  while (dotX < x + width) {
    page.drawLine({
      start: { x: dotX, y: y - 3 },
      end: { x: Math.min(dotX + 3, x + width), y: y - 3 },
      thickness: 0.7,
      color: ink,
    });
    dotX += 6;
  }

  page.drawText(value, {
    x: x + 4,
    y,
    size: 10,
    font,
    color: ink,
    maxWidth: width - 8,
  });
}

function drawIconCircle(page: PDFPage, label: string, x: number, y: number, font: PDFFont) {
  page.drawCircle({
    x,
    y: y + 4,
    size: 12,
    borderColor: navy,
    borderWidth: 1.2,
    color: rgb(1, 1, 1),
  });
  drawCenteredSmall(page, label, x, y, font);
}

function drawCenteredSmall(page: PDFPage, text: string, centerX: number, y: number, font: PDFFont) {
  const size = 8;
  page.drawText(text, {
    x: centerX - font.widthOfTextAtSize(text, size) / 2,
    y,
    size,
    font,
    color: navy,
  });
}

async function embedImage(pdfDoc: PDFDocument, bytes: Buffer, mimeType: string) {
  if (mimeType === "image/png") {
    return pdfDoc.embedPng(bytes);
  }

  return pdfDoc.embedJpg(bytes);
}

export async function createMandatePdf(input: MandatePdfInput) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const signatureImage = await pdfDoc.embedPng(dataUrlBytes(input.signatureDataUrl));
  const idPhotoImage = await embedImage(pdfDoc, input.idPhotoBytes, input.idPhotoMimeType);

  page.drawRectangle({ x: 0, y: 772, width: 595.28, height: 69.89, color: navy });
  drawCenteredText(page, "REQUEST LETTER FOR DUPLICATE", 812, 21, bold, rgb(1, 1, 1));
  drawCenteredText(page, "VEHICLE REGISTRATION DOCUMENT", 786, 21, bold, rgb(1, 1, 1));

  let y = 735;
  drawText(page, "To,", 44, y, 12, bold);
  drawText(page, "To Whom This May Concern", 44, y - 18, 12, bold);
  drawText(page, "Date:", 405, y - 8, 12, bold);
  drawField(page, formatDate(input.date), 440, y - 8, 108, regular);

  y -= 70;
  drawText(page, "I, Mr./Mrs./Ms.", 44, y, 12, regular);
  drawField(page, input.clientName, 125, y, 145, regular);
  drawText(page, ", ID:", 273, y, 12, regular);
  drawField(page, input.clientIdLabel, 300, y, 160, regular);

  y -= 36;
  drawText(page, "Hereby wish to state that I have lost my vehicle's registration document and", 44, y, 12, regular);
  drawText(page, "wish to make use of the license hub's assistance in obtaining a duplicate", 44, y - 20, 12, regular);
  drawText(page, "on my behalf.", 44, y - 40, 12, regular);

  y -= 78;
  drawIconCircle(page, "CAR", 56, y + 1, bold);
  drawText(page, "VEHICLE DETAILS", 80, y, 15, bold, navy);

  const rows = [
    ["DOC", "Vehicle Registration Number:", valueOrLine(input.registrationNumber)],
    ["#", "VIN Number:", valueOrLine(input.vin)],
    ["CAR", "Make:", valueOrLine(input.make)],
    ["PC", "Model:", valueOrLine(input.model)],
    ["CLR", "Color:", valueOrLine(input.colour)],
  ];

  y -= 36;
  rows.forEach(([icon, label, value]) => {
    drawIconCircle(page, icon, 56, y + 1, bold);
    drawText(page, label, 80, y, 11, regular);
    drawDottedField(page, value, 250, y, 190, regular);
    y -= 32;
  });

  drawIconCircle(page, "SIG", 56, y + 1, bold);
  drawText(page, "Signature:", 80, y, 12, bold);
  page.drawLine({ start: { x: 148, y: y - 2 }, end: { x: 430, y: y - 2 }, thickness: 0.9, color: ink });
  page.drawImage(signatureImage, {
    x: 160,
    y: y - 8,
    width: 180,
    height: Math.min(48, (signatureImage.height / signatureImage.width) * 180),
  });

  y -= 36;
  page.drawLine({ start: { x: 34, y }, end: { x: 561, y }, thickness: 1.5, color: navy });

  y -= 22;
  page.drawRectangle({
    x: 34,
    y: 48,
    width: 527,
    height: y - 48,
    borderColor: navy,
    borderWidth: 1.5,
    color: lightBlue,
  });
  page.drawRectangle({ x: 82, y: y - 31, width: 431, height: 28, color: navy });
  drawCenteredText(page, "IMPORTANT: IDENTITY VERIFICATION", y - 23, 18, bold, rgb(1, 1, 1));

  drawCenteredText(page, "PLACE ACTUAL ID IN THE SPACE BELOW", y - 60, 16, bold, navy);
  drawCenteredText(page, "AND TAKE A PICTURE OF THE ENTIRE PAGE", y - 82, 16, bold, navy);
  drawCenteredText(page, "ACTUAL ID", y - 60, 16, bold, red);
  drawCenteredText(page, "ENTIRE PAGE", y - 82, 16, bold, red);

  const photoY = y - 238;
  page.drawRectangle({
    x: 74,
    y: photoY,
    width: 447,
    height: 130,
    borderColor: navy,
    borderWidth: 1.2,
    color: rgb(1, 1, 1),
  });

  const scale = Math.min(180 / idPhotoImage.width, 108 / idPhotoImage.height);
  page.drawImage(idPhotoImage, {
    x: 94,
    y: photoY + 11,
    width: idPhotoImage.width * scale,
    height: idPhotoImage.height * scale,
  });
  drawText(page, "PLACE YOUR", 330, photoY + 78, 17, bold, navy);
  drawText(page, "ACTUAL ID HERE", 316, photoY + 52, 18, bold, red);

  drawCenteredText(page, "THEN", photoY - 22, 12, bold, navy);
  page.drawCircle({ x: 130, y: photoY - 61, size: 30, color: navy });
  drawCenteredSmall(page, "CAM", 130, photoY - 65, bold);
  drawText(page, "TAKE A CLEAR PICTURE OF THE", 180, photoY - 49, 16, bold, navy);
  drawText(page, "ENTIRE PAGE (THIS PAGE)", 180, photoY - 72, 16, bold, navy);
  drawText(page, "ENTIRE PAGE", 180, photoY - 72, 16, bold, red);
  drawText(page, "Make sure all details are visible and readable.", 180, photoY - 91, 10, regular, muted);

  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 36, color: navy });
  drawText(page, "INCOMPLETE SUBMISSIONS MAY CAUSE DELAYS.", 105, 13, 10, bold, rgb(1, 1, 1));
  drawText(page, "THANK YOU!", 425, 13, 10, bold, rgb(1, 1, 1));

  return Buffer.from(await pdfDoc.save());
}

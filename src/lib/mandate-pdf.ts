import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

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

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 42;
const navy = rgb(0.03, 0.18, 0.35);
const lightBlue = rgb(0.93, 0.97, 1);
const ink = rgb(0.07, 0.09, 0.12);
const muted = rgb(0.34, 0.4, 0.38);
const line = rgb(0.73, 0.78, 0.82);

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function valueOrLine(value: string | null) {
  return value?.trim() || "To be confirmed";
}

function dataUrlBytes(dataUrl: string) {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return text;
  }

  let trimmed = text;

  while (trimmed.length > 1 && font.widthOfTextAtSize(`${trimmed}...`, size) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }

  return `${trimmed}...`;
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

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      currentLine = candidate;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: PDFFont,
  color = ink,
) {
  const lines = wrapText(text, font, size, maxWidth);

  lines.forEach((lineText, index) => {
    drawText(page, lineText, x, y - index * (size + 6), size, font, color);
  });

  return y - lines.length * (size + 6);
}

function drawField(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  labelWidth: number,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  drawText(page, label, x, y, 10, fonts.bold, muted);
  page.drawLine({
    start: { x: x + labelWidth, y: y - 3 },
    end: { x: x + width, y: y - 3 },
    thickness: 0.8,
    color: line,
  });
  drawText(page, fitText(value, fonts.regular, 11, width - labelWidth - 10), x + labelWidth + 6, y, 11, fonts.regular);
}

function drawSectionTitle(page: PDFPage, title: string, x: number, y: number, width: number, font: PDFFont) {
  page.drawRectangle({ x, y: y - 8, width, height: 30, color: lightBlue, borderColor: navy, borderWidth: 1 });
  drawText(page, title, x + 12, y + 1, 12, font, navy);
}

function drawImageContained(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
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
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const signatureImage = await pdfDoc.embedPng(dataUrlBytes(input.signatureDataUrl));
  const idPhotoImage = await embedImage(pdfDoc, input.idPhotoBytes, input.idPhotoMimeType);
  const fonts = { regular, bold };

  page.drawRectangle({ x: 0, y: pageHeight - 82, width: pageWidth, height: 82, color: navy });
  drawCenteredText(page, "REQUEST LETTER FOR DUPLICATE", 798, 20, bold, rgb(1, 1, 1));
  drawCenteredText(page, "VEHICLE REGISTRATION DOCUMENT", 772, 20, bold, rgb(1, 1, 1));

  let y = 724;
  drawText(page, "To Whom This May Concern", margin, y, 11, bold);
  drawField(page, "Date", formatDate(input.date), 382, y - 9, 170, 34, fonts);

  y -= 58;
  drawField(page, "Full name", input.clientName, margin, y, 250, 70, fonts);
  drawField(page, "ID number", input.clientIdLabel, 314, y, 238, 74, fonts);

  y -= 38;
  y = drawWrappedText(
    page,
    "I hereby state that I have lost my vehicle's registration document and request License Hub's assistance in obtaining a duplicate vehicle registration document on my behalf.",
    margin,
    y,
    pageWidth - margin * 2,
    11,
    regular,
  );

  y -= 18;
  drawSectionTitle(page, "Vehicle Details", margin, y, pageWidth - margin * 2, bold);

  y -= 38;
  const leftX = margin;
  const rightX = 318;
  drawField(page, "Registration", valueOrLine(input.registrationNumber), leftX, y, 240, 82, fonts);
  drawField(page, "VIN", valueOrLine(input.vin), rightX, y, 234, 34, fonts);
  y -= 30;
  drawField(page, "Make", valueOrLine(input.make), leftX, y, 240, 54, fonts);
  drawField(page, "Model", valueOrLine(input.model), rightX, y, 234, 54, fonts);

  y -= 42;
  drawText(page, "Signature", margin, y, 10, bold, muted);
  y -= 68;
  page.drawRectangle({
    x: margin,
    y,
    width: pageWidth - margin * 2,
    height: 54,
    borderColor: line,
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });
  drawImageContained(page, signatureImage, margin + 18, y + 8, pageWidth - margin * 2 - 36, 38);
  page.drawLine({
    start: { x: margin, y: y - 8 },
    end: { x: pageWidth - margin, y: y - 8 },
    thickness: 0.8,
    color: line,
  });

  y -= 48;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1.2, color: navy });

  y -= 18;
  const idSectionBottom = 76;
  page.drawRectangle({
    x: margin,
    y: idSectionBottom,
    width: pageWidth - margin * 2,
    height: y - idSectionBottom,
    borderColor: navy,
    borderWidth: 1.4,
    color: lightBlue,
  });
  page.drawRectangle({ x: margin + 22, y: y - 34, width: pageWidth - margin * 2 - 44, height: 24, color: navy });
  drawCenteredText(page, "IDENTITY VERIFICATION PHOTO", y - 27, 12, bold, rgb(1, 1, 1));

  drawCenteredText(page, "Uploaded ID photo for verification", y - 52, 10, bold, navy);

  const photoBox = {
    x: margin + 28,
    y: idSectionBottom + 22,
    width: pageWidth - margin * 2 - 56,
    height: y - idSectionBottom - 88,
  };
  page.drawRectangle({
    ...photoBox,
    borderColor: navy,
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });
  drawImageContained(page, idPhotoImage, photoBox.x + 12, photoBox.y + 12, photoBox.width - 24, photoBox.height - 24);

  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 46, color: navy });
  drawText(page, "Generated by License Hub", margin, 19, 10, bold, rgb(1, 1, 1));
  drawText(page, "Incomplete or unreadable submissions may cause delays.", 314, 19, 9, regular, rgb(1, 1, 1));

  return Buffer.from(await pdfDoc.save());
}

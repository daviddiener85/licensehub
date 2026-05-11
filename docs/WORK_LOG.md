# Work Log

This repository keeps a dated record of product/specification decisions and implementation work so changes can be traced over time.

## 2026-05-11 19:30 SAST

### Mandate form foundation started

- Added a new `MANDATE_FORM` document type while retaining `MANDATE_LETTER` for legacy records.
- Added a Prisma migration for the new mandate form document type and applied it locally.
- Updated seed data and service document requirements to use `Completed mandate form` instead of handwritten mandate letters.
- Added shared document labels so admin, client and supplier views use consistent document names.
- Added a populated mandate form preview to the client application page based on the reference form design.
- Verified `npm run lint` and `npm run build` both pass.

### Mandate form notes

- The preview is populated from captured application data: client name, date, registration number, VIN, make, model and colour.
- The client ID number is still shown as a secure placeholder because the current app stores it encrypted and does not yet include a decrypt/display path for PDF generation.
- Next implementation step: add the phone signature pad, ID photo capture/upload, and actual PDF generation from the approved mandate form template.

## 2026-05-11 19:24 SAST

### Local GitHub checkout setup fixed

- Fixed the local build error caused by the missing generated Prisma client.
- Ran Prisma generation in the GitHub checkout and added `postinstall` so `prisma generate` runs automatically after future installs.
- Restored the local `.env` file for development while keeping it ignored by git.
- Added `.env.example` so required local environment variables are visible without committing secrets.
- Verified `npm run build` completes successfully.

## 2026-05-11 19:13 SAST

### Signed SLA received

- Received the signed SLA.
- Stored the signed SLA at `docs/agreements/Signed Service Agreement.pdf`.
- Project record updated to note that the signed service-level agreement has been received.

## 2026-05-11 16:45 SAST

### Specification update saved

- Added `docs/specs/license_hub_spec_v1_7.docx` to preserve the current product specification in the repository.
- Compared `license_hub_spec_v1_7.docx` against `license_hub_spec_v1_6.docx`.
- Recorded the v1.7 specification change: the handwritten mandate letter has been replaced with an auto-populated digital mandate form.

### Product changes captured from spec v1.7

- Client Step 3 is now Mandate Form instead of Mandate Letter.
- The system must auto-populate the duplicate vehicle registration request form using captured client and vehicle data.
- The form must include full name, ID number, date, vehicle registration number, VIN, make, model and colour.
- Clients sign directly on their phone using a touch signature pad.
- Clients upload an ID document photo, which is embedded into the generated form.
- The system generates and stores a completed signed PDF against the application record.
- Admin and supplier users can view and print the completed mandate form from the platform.
- The previous handwritten mandate letter upload requirement is removed.
- The business owner must provide the approved mandate form template before the mandate form module is built.

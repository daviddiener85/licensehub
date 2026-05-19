# Work Log

This repository keeps a dated record of product/specification decisions and implementation work so changes can be traced over time.

## 2026-05-15 08:30 SAST

### Admin client database added

- Confirmed the app already has a first-class `Client` database model used by admin-created links and public `/apply` submissions.
- Added an admin client database page at `/admin/clients`.
- Added searchable client lookup across name, cellphone, email, city, postal code, application number, registration number and VIN.
- Added client profile summaries with entity type, referral source, address, latest application, payment summary and application count.
- Linked the admin workspace header to the client database.
- Completed validation checks with lint and production build.

### Public landing page added

- Replaced the internal test-style home page with a public License Hub landing page.
- Added a generated hero image asset for the public website at `public/landing/license-hub-hero.png`.
- Explained the core License Hub services: duplicate certificate, change of ownership and licence renewal.
- Added public flow sections that show how clients move from service selection into identity capture, document upload, mandate signing and admin review.
- Added clear application calls to action that route into `/apply`.
- Kept a subdued staff link for internal access while making the public application path primary.
- Completed validation checks with lint and production build.

### OpenAI licence disk scan added

- Replaced the local Tesseract licence disk OCR helper with an OpenAI vision extraction call.
- Added structured JSON extraction for registration number, VIN/chassis, make, model, confidence and manual-review status.
- Kept client confirmation as the source of truth before vehicle details are used on the mandate form.
- Updated the public intake copy and button labels from OCR to AI scan.
- Documented `OPENAI_API_KEY` and `OPENAI_LICENSE_DISK_MODEL` in `.env.example`.
- Removed the unused `tesseract.js` dependency.
- Completed validation checks with lint and production build.

### Approval readiness gate added

- Removed the admin Approve action when confirmed required documents are missing or not accepted.
- Added a selected-review readiness message that tells admin which requirement blocks approval.
- Added a server-side guard to `approveToSupplier` so incomplete applications cannot be approved by a crafted request.
- Verified `LH-2026-AB9741` now shows the blocking document message instead of the Approve action.
- Completed validation checks with lint and production build.

### Supplier desk refreshed

- Reworked the supplier page from a static-feeling portal into an active supplier desk.
- Added queue metrics for ready-to-produce, produced and returning orders.
- Added a clickable production queue with selected order support via `?order=`.
- Expanded selected pack details with status, client contact, entity type, vehicle, VIN/chassis and document pack cards.
- Limited supplier actions to the relevant next step for the selected status.
- Added clearer empty and waiting states.
- Completed validation checks with lint and production build.

### Supplier urgency and order comments added

- Added supplier urgency to applications with Normal, Urgent and Very urgent values.
- Added red `!` and `!!` line-item markers for urgent and very urgent supplier work.
- Added an order comment history table so admin notes and supplier feedback stay attached to the order.
- Added an admin supplier handoff panel to set urgency and add internal supplier notes before approval.
- Added supplier feedback capture on the supplier desk using the same order comment history.
- Applied the database migration locally and regenerated the Prisma client.
- Completed validation checks with lint and production build.

### Admin filters added

- Added admin table filters for search, status, payment, documents, urgency and service.
- Kept filters in the URL query string so filtered views can be refreshed or shared.
- Added a visible result count and a clear-filter action.
- Completed validation checks with lint and production build.

### Document review controls added

- Added per-document Accept and Reject controls in the admin selected-review panel.
- Added document acceptance and rejection server actions that update review status, reviewer and review timestamp.
- Rejections now require a reason and move the application into document resubmission required.
- Kept document opening separate from document approval so uploaded files can be inspected before acceptance.
- Completed validation checks with lint and production build.

## 2026-05-14 08:30 SAST

### Admin workspace refresh and new order visibility

- Added an admin workspace refresh interval setting with a default of 30 seconds and a configurable range of 5 to 600 seconds.
- Added an admin workspace checkbox to enable or disable auto-refresh entirely.
- Added a database migration and seed update for the admin refresh interval setting.
- Added automatic admin page refresh using the configured interval.
- Added browser-local seen-order tracking so newly appearing orders are highlighted in a different colour until an admin clicks the order row.
- Added admin order row metadata used by the client-side highlighter to distinguish new orders after refresh.
- Completed validation checks with Prisma generation, migration apply, seed, lint, production build and smoke checks for `/admin` and `/admin/settings`.

### Public application intake persistence

- Added a service-selection step at the start of the public `/apply` flow so clients choose the product or service before intake begins.
- Kept `Duplicate Certificate` selected as the default service while allowing the flow to use any active service in the catalogue later.
- Added seeded `Change of Ownership` and `Licence Renewal` service options and marked both as Gauteng only in the public selector.
- Connected the public `/apply` intake flow to a server action that creates or updates the client record and creates a real application for the selected service.
- Changed the public identity step to collect the client address without presenting it as a delivery decision; delivery confirmation and any delivery cost belong at payment.
- Wired the licence disk scan action to OCR so uploaded disk photos can prefill registration, VIN/chassis, make and model when readable, with manual correction still required before confirmation.
- Added OCR timeouts and local OCR caching so a slow licence disk scan falls back to manual entry instead of leaving the client waiting indefinitely.
- Repositioned licence disk OCR as an optional assist because it has not produced reliable structured results; licence disk upload plus manually confirmed vehicle fields are now the source of truth.
- Renamed the public upload/sign step to mandate form, displayed the populated mandate form before signature, and replaced the placeholder with a working signature pad.
- Changed public application submission so the mandate form step submits the selected files and signature to the server, creates the application, saves licence disk/proof documents, stores mandate submission metadata and generates the mandate PDF document.
- Fixed the admin document summary so applications with no document records no longer appear as accepted.
- Refined the generated mandate PDF spacing by separating the signature label from the signature box, removing the no-longer-required colour row and reducing the ID verification block height.
- Further tightened the mandate PDF bottom spacing by shrinking the signature area and increasing the ID photo frame.
- Added explicit personal-information consent before saving the public application intake.
- Added a pending base-fee payment record when the public application is submitted, ready for the payment workflow to be wired in fully.
- Added a submitted confirmation page at `/apply/submitted` showing the generated application reference.
- Kept vehicle colour out of the public intake requirements.

## 2026-05-13 08:30 SAST

### v1.8 feedback foundation work continued

- Reworked the client token page into the first landing page clients see after opening their application link, before any client or vehicle record is known.
- Added an explanation-first intake journey with a Proceed action, identity questions, legal ownership selection, vehicle relationship capture and ownership-specific document checklist.
- Added `/apply` as the public website application entry point and redirected the demo client route to it.
- Expanded the public flow to continue from document requirements into upload/signing and payment request stages.
- Added a vehicle-details step before document upload so registration number, VIN or chassis number, make and model can populate the generated mandate form, with OCR positioned as a later prefill enhancement from the licence disk photo.
- Added a client confirmation gate after vehicle detail capture so OCR-prefilled or manually entered vehicle values must be confirmed before they can be used on the generated mandate form.
- Removed vehicle colour from the public intake prerequisites because it is not required for the current flow.
- Removed the signed mandate form from the upload checklist because the system generates it from captured details and the client signature.
- Added first-class client profile fields for entity type and referral source.
- Added a database migration for the new client profile fields and regenerated the Prisma client.
- Added an admin client-link creation form that captures profile, referral, entity type, address and vehicle details.
- Added structured entity-specific document requirement sets for private owner, deceased estate, company or trust and Non-SA citizen applications.
- Connected the selected entity type to the client, admin and supplier views so the correct document set is visible during submission and review.
- Updated seeded demo applications with representative entity types and referral sources.
- Applied the new migration locally and refreshed the seed data.
- Removed the stale duplicate mandate PDF generator copy from the working tree.
- Completed validation checks with lint, production build, migration apply and seed.

## 2026-05-12 19:30 SAST

### Specification v1.8 saved and scope record updated

- Added `docs/specs/license_hub_spec_v1_8.docx` as the current formal specification amendment.
- Recorded the v1.8 scope changes: document-first client submission, entity type document requirements, client resubmission, proof-of-address date validation, upload completion states and admin/supplier-only mandate PDF visibility.
- Recorded new document requirement sets for private owner, deceased estate, company or trust and Non-SA citizen applications.
- Recorded the open business decision on document version handling when a client resubmits documents.
- Prepared a Morne-facing feedback note covering work completed, added scope, required decisions and the short-term plan for tomorrow and the rest of the week.
- Confirmed that no further product build work is planned for tonight.

## 2026-05-12 09:00 SAST

### Mandate PDF refinement and ID handling

- Continued mandate form work from the latest repository version.
- Preserved the previous working state before applying the latest mandate form refinements.
- Refined the generated mandate PDF into a cleaner A4 layout with stable sections for the request letter, vehicle details, signature, ID handling note and identity verification photo.
- Added contained image fitting for the client signature and uploaded ID photo so generated PDFs avoid cropped or overlapping content.
- Enlarged the mobile signature pad and final PDF signature box for finger signing on phones.
- Updated the client capture step so the uploaded ID photo previews inside the identity verification block before submission.
- Added mobile camera capture support for the ID photo upload field.
- Removed internal verification/checklist language and secure-ID implementation notes from the traffic-department-facing PDF.
- Updated demo ID labels to use `1234567890123` during testing.
- Removed the duplicate `To,` salutation line and gave the signature box full-width spacing in the generated PDF.
- Simplified the client application page so mandate capture is the primary task, with application details and documents moved into secondary expandable sections.
- Reordered the client submission flow so supporting documents are requested first: ID photo, licence disk photo and proof of address dated within the last 3 months.
- Added supporting document capture to the mandate submission process so licence disk and proof of address uploads update the application document records for admin review.
- Kept generated mandate output off the client page so completed mandate records are reviewed from the admin workspace.
- Added client-side upload completion checks, image previews where supported and clear uploaded indicators where previews are unavailable.
- Added immediate proof-of-address age validation and disabled submission until all required fields are complete.
- Added a submitted state that collapses the document upload and mandate form sections into completed summary rows after submission.
- Made submitted summary rows expandable so clients can replace uploaded documents or replace the mandate signature after submission.
- Added resubmission handling that updates the existing application document records and regenerates the mandate form when required.
- Centralized client ID display rules in `src/lib/client-identity.ts`.
- Kept browser-facing mandate previews masked/placeholder-based while allowing the server-side PDF generator to resolve the full ID number when `CLIENT_ID_ENCRYPTION_KEY` is configured.
- Documented `CLIENT_ID_ENCRYPTION_KEY` in `.env.example`.
- Updated the public demo client link to use `/client/demo-application` instead of the resubmission-specific seeded token.
- Completed validation checks for the updated mandate form workflow and generated PDF.

### Mandate form notes

- Existing demo data still uses placeholder encrypted ID values, so demo PDFs continue to show `Demo ID on file`.
- Production ID population expects stored values in the `lh-id:v1:<iv>:<tag>:<ciphertext>` AES-256-GCM format with a base64 32-byte key in `CLIENT_ID_ENCRYPTION_KEY`.

## 2026-05-11 19:55 SAST

### Mandate form PDF generation added

- Added server-side PDF generation for the duplicate vehicle registration mandate form.
- The generated PDF includes the populated request letter, vehicle details, captured client signature and uploaded ID photo.
- Updated mandate form capture so submitting the signature and ID photo now creates `mandate-form.pdf`.
- Updated the `MANDATE_FORM` document record with the generated PDF storage path and file size.
- Added PDF links in client, admin and supplier views when the generated mandate form is available.
- Limited ID photo uploads to JPG and PNG because those formats are embedded into the generated PDF.
- Completed validation checks for the mandate form PDF generation workflow.

### Mandate form notes

- Generated PDFs are stored in the development upload location pending private production storage.
- The client ID number still uses a secure placeholder until the application has an approved decrypt/display path for PDF generation.

## 2026-05-11 19:45 SAST

### Mandate form capture added

- Added a `MandateFormSubmission` database model to store client mandate form capture data.
- Added and applied the database change for mandate form submissions.
- Added a client-side signature pad for phone/touch signing.
- Added ID photo upload for the mandate form identity verification step.
- Added a server action that saves the signature and ID photo metadata against the application.
- Added admin and supplier visibility for whether mandate capture has been submitted.
- Excluded uploaded client ID photos from repository history.
- Completed validation checks for the mandate form capture changes.

### Mandate form notes

- Uploaded ID photos are stored in the development upload location pending private production storage.
- The next implementation step is generating the final signed mandate PDF from the captured signature, ID photo and populated form data.

## 2026-05-11 19:30 SAST

### Mandate form foundation started

- Added a new `MANDATE_FORM` document type while retaining `MANDATE_LETTER` for legacy records.
- Added and applied the database change for the new mandate form document type.
- Updated seed data and service document requirements to use `Completed mandate form` instead of handwritten mandate letters.
- Added shared document labels so admin, client and supplier views use consistent document names.
- Added a populated mandate form preview to the client application page based on the reference form design.
- Completed validation checks for the mandate form foundation changes.

### Mandate form notes

- The preview is populated from captured application data: client name, date, registration number, VIN, make, model and colour.
- The client ID number is still shown as a secure placeholder because the current app stores it encrypted and does not yet include a decrypt/display path for PDF generation.
- Next implementation step: add the phone signature pad, ID photo capture/upload, and actual PDF generation from the approved mandate form template.

## 2026-05-11 19:24 SAST

### Project setup fixed

- Fixed the setup issue caused by the missing generated Prisma client.
- Added automatic Prisma client generation after dependency installation.
- Restored the development `.env` file while keeping it ignored by git.
- Added `.env.example` so required environment variables are visible without committing secrets.
- Confirmed the application builds successfully.

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

# Work Log

This repository keeps a dated record of product/specification decisions and implementation work so changes can be traced over time.

## 2026-07-02

### Mandate PDF and upload hardening

- Fixed `entityDisplayName` being dropped on mandate PDF resubmission: `mandatePdfApplicationSelect` never selected the column, so `submitMandateFormCapture`, `resubmitSupportingDocuments`, and `resubmitMandateSignature` were hardcoding it to `null`. Company/trust and deceased-estate mandate PDFs regenerated after any resubmission with generic fallback text ("the company or trust" / "the deceased estate") instead of the real entity name.
- Added a defensive character cap on the entity name used in the mandate declaration text so an unusually long name can't wrap into enough extra lines to push the fixed-position Vehicle Details/Signature/ID-photo sections off the page.
- Raised the Server Actions request body limit from the Next.js default (1MB) via `experimental.serverActions.bodySizeLimit`, and added explicit per-file upload size validation with a clear error message. Real phone-camera photos (2-8MB typical) were exceeding the previous default with no app-level handling.
- Changed `verifyMetaWebhookSignature` to fail closed instead of open when `WHATSAPP_APP_SECRET` is unset, so unsigned WhatsApp delivery-status webhook calls are rejected rather than accepted by default.
- Removed the unused `WHATSAPP_WEBHOOK_SECRET` env var (dead since introduction; only `WHATSAPP_APP_SECRET` is ever read).

### Work log and UAT gap log caught up

- Backfilled this log for commits from 2026-06-17 through 2026-06-21 that had landed without an entry.
- Verified two `docs/uat/uat-gap-log.md` candidate improvements (admin checklist required/optional marker, EFT proof success confirmation) against current code and marked them resolved; they were already shipped in the 2026-06-16 UAT polish pass but never marked off.

## 2026-06-21

### Public service catalogue bootstrap and preselection

- Added `change-of-ownership` and `licence-renewal` fallback service definitions alongside the existing Duplicate Certificate fallback, and made `/apply` and `listActiveServices` upsert these fallback services into the database automatically so the public site never hits a missing-service error for the three advertised services.
- Linked each service card on the public landing page directly to `/apply?service=<slug>`, and made `/apply` read that query param to preselect the matching service in the intake flow instead of always defaulting to Duplicate Certificate.
- Treated any service with a zero base price as a quote-flow service (in addition to the existing `license-fees`/`licence-fees` slug check).

### Intake submission hardening

- Fixed a bug where a licence disk photo (or other upload) selected earlier in the flow could be lost from the submitted `FormData` on final submit; uploaded files are now tracked in a single `uploadedFiles` map keyed by field name and re-attached to `FormData` for every upload field before submission, not just the licence disk photo.
- Added `scripts/regression/client-intake-payment-submit.ts` and a `test:intake-payment` npm script as a repeatable end-to-end check of the public intake-to-payment path.

### Legal policy pages added

- Added draft `/terms-and-conditions` and `/cancellations` pages, a shared `LegalPageShell` layout, and a `PublicFooter` component linking to both, surfaced from the landing page, `/apply`, and the client status page. Copy is a first draft and has not had a legal review pass.

### Customer-facing copy tightened

- Rewrote landing-page hero copy, service descriptions, and process-step labels, plus `/apply` and `/apply/submitted` copy, for a more direct tone.

### Admin workspace refined

- Replaced the static admin metrics row with clickable queue cards (Needs quote, Payment follow-up, Document review, Ready to approve, At supplier, Returning) that link straight into the matching filtered view.
- Added a `view` query param (`overview`/`documents`/`payment`/`supplier`/`messages`/`audit`) to deep-link into a specific panel of the selected application, and a combined "payment follow-up" filter bucket covering EFT/Paystack/additional-charge pending states.
- Consolidated the admin application list columns (dropped separate Payment/Documents/Status columns in favor of a single "Next action" column).
- Normalized `appBaseUrl`/`requestBaseUrl` output through a real `URL` parse and canonicalized the bare `lichub.co.za` host to `www.lichub.co.za`.
- Added a shared `SettingsActionButton` (disables and shows a pending label during submit) and made settings actions (`createService`, `updateService`, `updateRetentionSetting`, `updateAdminWorkspaceSetting`, `createUser`, `updateUser`, `updateUserStatus`) redirect back to `/admin/settings` with a `notice` query param instead of silently completing.
- Kept existing filter/query params intact when selecting an application from the admin list (`AdminApplicationCell` now merges into the current search params instead of replacing them).

## 2026-06-17

### Client status link formalized

- Made existing `/client/[token]` application tokens resolve to a client status portal with current status, next action, payment state, document state, recent updates, and resubmission upload access when required.
- Added an admin action to resend the secure status link to the client via WhatsApp.
- Updated outbound client messages so automated and manual WhatsApp messages include the secure status link.

### Regression gate added

- Added `npm run test:regression` as a repeatable browser-backed regression check for admin WhatsApp templates, additional charge submission, and supplier print behavior.
- Added the regression command to the main README and UAT README so it becomes part of the normal pre-release verification path.
- Added a GitHub Actions CI workflow to run lint, production build, and the seeded regression suite automatically on push, pull request, and manual dispatch.
- Hardened additional-charge payment reference generation so repeated local/UAT testing does not fail on duplicate Paystack transaction references.

### Mobile upload compatibility

- Removed the `capture="environment"` restriction from ID photo, licence disk, and supporting-document file inputs so mobile users can pick an existing gallery photo instead of being forced straight into the camera.
- Extended accepted upload MIME types to include `image/heic`/`image/heif` alongside JPEG and PNG across the intake flow, mandate capture form, and EFT proof upload form.

### Launch payment routing corrections

- Reverted automatic Paystack selection for quotes and additional charges back to EFT-only by default (`paymentMethodForLaunch` removed), since Paystack is still awaiting provider review. The admin "Add Charge" and "Publish Quote" forms now let admin explicitly choose EFT or Paystack per charge when Paystack is configured.
- Added `requestBaseUrl()` to derive the live request host from `x-forwarded-host`/`x-forwarded-proto` headers, and used it for Paystack callback URLs so callbacks return to the actual deployed domain instead of a configured fallback that could point at the wrong host.
- Fixed the public intake success flow: `createPublicApplicationIntake` now returns a `{ status: "success", redirectTo }` state and the client performs the redirect via `window.location.assign`, instead of calling `redirect()` from inside a try/catch, which was being caught and surfaced as a submission error on some EFT submissions.

### Admin document preview fixes

- Switched the PDF preview from an `<iframe>` to an `<object>` element with a fallback message ("This file can't be previewed here... Use Open original") for browsers that can't render embedded PDFs.
- Marked the image preview `Image` component `unoptimized` (later replaced with a plain `<img>` the same day) so uploaded originals render reliably instead of failing through Next's image optimizer.

### ID photo review workflow

- Added a first-class `DocumentType.ID_PHOTO` document record for mandate ID photos (previously tracked only implicitly via `MandateFormSubmission` presence), so ID photos now go through the same admin accept/reject/pending review pipeline as other required documents.
- Added the `/uploads/[...path]` route (path-traversal guarded against the upload root) to serve files from local disk storage, since admin previews needed a stable serving path. Note: this route currently has no authentication check of its own — access relies on the URL (a `cuid`-keyed application folder) not being guessed or leaked.

## 2026-06-16

### UAT polish pass

- Strengthened the `/apply/submitted` EFT proof confirmation state so uploads are acknowledged with a clearer success banner and next-step guidance.
- Added required/conditional scope markers to admin checklist rows so operations can see at a glance which checks are blocking approval and which only apply to certain entity flows.

### Supplier pack visibility tightened

- Restricted the supplier desk document list to approved uploads only so supplier can work from the accepted pack without seeing pending or rejected files.

## 2026-06-07

### Launch payment rule confirmed

- EFT remains the launch default payment method.
- Paystack is activated and awaiting provider review, and test keys can enable it in local/test flows.
- Proof of EFT payment is required before admin confirms payment and continues review.

### Paystack test wiring added

- Added `PAYSTACK_PUBLIC_KEY` to the env template alongside the existing secret and webhook placeholders.
- Added Paystack checkout initialization for payment requests when test keys are present.
- Added a Paystack webhook route so successful test payments can confirm automatically.
- Updated the submitted page and admin review UI to handle Paystack payments alongside EFT.

### Apply page hardening

- Made `/apply` fall back to the built-in service list if the database service lookup fails.
- This prevents a transient service query problem from crashing the entire public application page.

### Service schema compatibility fix

- Added fallback service reads for environments where `Service.deliveryFee` has not been migrated yet.
- `/apply`, `/admin/settings`, and public intake pricing now continue with a zero delivery fee fallback instead of crashing on missing-column errors.
- Switched the service reads used by the public intake and admin settings pages to raw SQL so they tolerate the deployed schema lag safely.

## 2026-05-31

### Intake flow simplification, EFT status progression, and admin review UX updates

- Reordered intake flow so **Vehicle Relationship** comes before **Who You Are**.
- Simplified relationship model by removing explicit non-SA relationship selection; `Private owner` now covers SA and foreign individuals.
- Added required **Citizenship status** selector at the top of **Who You Are** and hid the remaining form fields until selected.
- Split foreign identity capture into separate required values (`Passport number` and `TRN number`) while keeping SA path as `ID number`.
- Enforced non-SA supporting document requirement as both `Traffic register document (TRN)` and `Passport document`.
- Removed separate non-SA ID-photo blocker and adjusted identity document handling for mandate generation.
- Improved step transition UX:
  - auto-scroll to active step content
  - preserve progress-strip visibility while scrolling
  - autofocus first input on Who You Are.
- Updated priced EFT submission behavior:
  - public submit now creates pending EFT payment and charge records immediately for priced services
  - initial status now starts in awaiting-payment flow rather than awaiting-admin-quote for those submissions.
- Updated admin status wording for duplicate/EFT flows:
  - `Pending payment` when POP is not uploaded
  - `Verify payment` once POP is uploaded.
- Added admin in-page document quick view with:
  - close button
  - full-screen button
  - open-original fallback
  - image zoom controls (plus/minus/reset, wheel zoom, drag pan, touch pinch).
- Added admin document review correction action `Mark pending` to undo mistaken accept/reject actions.
- Replaced generic `Other document` labels with contextual requirement labels in admin views.
- Expanded review audit notes to include specific document names for accept/reject/reset actions.
- Collapsed review audit trail list behind an expandable dropdown.
- Added safe admin empty-state handling when no applications exist (prevents selected-application null dereference).
- Removed cancelled test applications from the DB when requested.

## 2026-05-24

### EFT-first launch flow, admin process hardening, and client communication updates

- Stabilized the client `/apply` flow through to payment request creation.
- Added service-level delivery fee support and included delivery in payment totals.
- Set test pricing for Duplicate Certificate to `R499.00` base with delivery fee support.
- Enforced EFT-first launch path while Paystack is still awaiting provider review.
- Added fictional EFT banking details to defaults for local/UAT use and displayed them on the client submitted page.
- Fixed payment submit blockers caused by hidden-step validation and cross-step file handling issues.
- Removed duplicate licence disk collection in mandate-related steps once captured in vehicle details.
- Improved submitted-page UX with clearer "what happens next" guidance, EFT proof upload status confirmation, and latest uploaded proof visibility.
- Added optional replace-proof action while keeping the default post-upload state clear and non-ambiguous.
- Added automatic outbound WhatsApp communication queue record on public application submission:
  - Confirms order received.
  - Includes payment reference number.
  - Confirms document review and ongoing updates.
- Expanded admin/process/UAT documentation:
  - Entity-specific admin flow sequences.
  - UAT scripts per entity type.
  - UAT gap log updates.
- Added and updated auth and middleware foundations for protected role flows.
- Completed validation checks with successful lint/build cycles after changes.

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
# 11 July 2026 — Specification v1.9

- Created `docs/specs/license_hub_spec_v1_9.docx` from v1.8.
- Added an implementation-alignment amendment for the current public intake, vehicle terminology and AI scan, payments, WhatsApp, document review, supplier privacy and printing, persistent storage, retention, and referral-routing behaviour.

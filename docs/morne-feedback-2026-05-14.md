# Morne Feedback - 2026-05-14

## Product direction confirmed today

- The public website flow must start with product or service selection before client intake begins.
- `Duplicate Certificate` remains the default service.
- `Change of Ownership` and `Licence Renewal` are included as selectable services, but are Gauteng only.
- The client address is collected as a client profile/application detail, not as a delivery decision.
- Delivery must be handled at payment:
  - Ask whether delivery is required.
  - Add delivery cost only if selected.
  - Ask the client to confirm or change the address at that point.
- Licence disk OCR is not reliable enough to be treated as the source of truth.
- The licence disk photo plus manually confirmed vehicle fields are the source of truth for the mandate form.
- The client must be able to read the populated mandate form before signing it.

## Work completed today

- Added the public service-selection step at the start of `/apply`.
- Connected `/apply` to active services from the database.
- Seeded the additional public service options:
  - Duplicate Certificate.
  - Change of Ownership, marked Gauteng only.
  - Licence Renewal, marked Gauteng only.
- Persisted the public intake into real database records:
  - Client profile.
  - Application.
  - Pending base-fee payment.
  - Status history.
- Added required client profile capture:
  - Full name.
  - Cellphone number.
  - Email address.
  - ID, passport, or traffic register number.
  - Client address.
  - Personal-information consent.
- Removed delivery wording from the address capture step.
- Added licence disk upload to the vehicle-details step.
- Added a vehicle detail confirmation gate before the mandate form can be generated.
- Added OCR as an optional `Try OCR` helper for the licence disk photo.
- Added OCR timeout handling so a slow scan falls back to manual entry instead of blocking the client.
- Repositioned OCR as optional because it did not produce reliable structured results from licence disk images.
- Renamed the public `Upload & Sign` step to `Mandate Form`.
- Added a populated mandate form preview before the client signs.
- Replaced the signature placeholder with a working touch/mouse signature pad.
- Changed the public mandate form step to submit the real payload:
  - ID photo.
  - Licence disk photo.
  - Proof of address.
  - Signature image.
  - Client details.
  - Vehicle details.
- Updated the public submit action so it now:
  - Creates the application.
  - Saves licence disk and proof-of-address document records.
  - Saves mandate submission metadata.
  - Generates the completed mandate PDF.
  - Creates the `MANDATE_FORM` document record.
  - Creates the pending payment record.
- Fixed the admin document summary so applications with no document records no longer show as `Accepted`.
- Added the submitted confirmation page at `/apply/submitted`.
- Refined the generated mandate PDF:
  - Removed the no-longer-required colour row.
  - Fixed signature label and signature box spacing.
  - Reduced wasted bottom spacing.
  - Enlarged the ID verification photo frame.
- Regenerated the latest test mandate PDF for `LH-2026-1B72BF` using the improved layout.
- Added admin auto-refresh settings:
  - Configurable refresh interval.
  - Enable/disable checkbox.
  - Default 30-second refresh.
- Added browser-local new-order highlighting in admin so new applications appear in a different colour until clicked.

## Validation completed

- Ran Prisma generation after schema changes.
- Applied the new migrations locally.
- Refreshed seed data locally.
- Ran lint successfully.
- Ran production build successfully.
- Smoke-checked `/apply`, `/apply/submitted`, `/admin`, and `/admin/settings` during the day.
- Regenerated a mandate PDF from an existing stored mandate submission.

## Important implementation notes

- Plain Tesseract OCR is not reliable enough for licence disk extraction.
- For launch, the safer flow is:
  - Upload licence disk photo.
  - Client manually enters registration, VIN/chassis, make and model from the disk.
  - Client confirms the values.
  - Those confirmed values populate the mandate form.
- If automated extraction becomes important later, use a more suitable document extraction or vision service rather than relying on generic OCR.
- The current public flow creates a pending payment record, but the actual payment decision and delivery-cost handling still need to be built.

## Decisions still needed

- Confirm final pricing for each service.
- Confirm payment methods for launch:
  - Paystack.
  - EFT.
  - Whether proof of EFT upload is required.
- Confirm delivery rules and pricing.
- Confirm whether delivery applies to all services or only specific services.
- Confirm final document lists for:
  - Duplicate certificate.
  - Change of ownership.
  - Licence renewal.
  - Private owner.
  - Deceased estate.
  - Company or trust.
  - Non-SA citizen.
- Confirm whether proof of address validity is exactly 3 calendar months or 90 days.
- Confirm production storage and access rules for uploaded documents and generated mandate PDFs.
- Confirm production handling of ID/passport values on generated forms.

## Recommended next build steps

- Build the real payment step:
  - Show service fee.
  - Ask whether delivery is required.
  - Add delivery cost if selected.
  - Confirm/change address if delivery is selected.
  - Create payment instructions or Paystack payment link.
- Add admin review detail for public submissions so admins can open and inspect the uploaded documents and generated mandate PDF.
- Add final document requirement rules per selected service and ownership type.
- Decide whether to remove OCR entirely from the first release or keep it as a hidden/internal experiment.
- Add better confirmation and error states after public submission.

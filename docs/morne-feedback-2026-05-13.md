# Morne Feedback - 2026-05-13

## Product direction confirmed today

- The client flow is now planned as a public website journey, not a secret or exclusive client link.
- The website will have a public Start Application or Proceed action.
- The intended flow is:
  - Website.
  - Public application start.
  - Explanation and intake page.
  - Client identifies themselves.
  - Client confirms their relationship to the vehicle.
  - System determines legal ownership category.
  - System shows the required documents for that ownership scenario.
  - Client uploads documents and signs the mandate.
  - System requests payment.

## Work completed today

- Added `/apply` as the public client application entry point.
- Updated the home page so the primary client-facing action is Start Application.
- Kept `/client/[token]` available for future follow-up or resubmission-style links, but it is no longer the primary public intake path.
- Reworked the intake journey so it no longer assumes we already know the client name, vehicle details or payment state.
- Added step-based intake screens for:
  - Explanation before documents are requested.
  - Client identity details.
  - Vehicle legal ownership category.
  - Client relationship to the vehicle or owner.
  - Vehicle details required for the mandate form.
  - Ownership-specific document checklist.
  - Document upload and mandate signature capture.
  - Payment request.
- Added the current ownership categories:
  - Private owner.
  - Deceased estate.
  - Company or trust.
  - Non-SA citizen.
- Added document checklists that change based on the selected legal ownership category.
- Removed signed mandate form from the upload checklist because the platform generates that form from captured details and the client signature.
- Added upload controls that open the file picker and show selected file names.
- Added vehicle detail fields required for the generated mandate form:
  - Registration number.
  - VIN or chassis number.
  - Make.
  - Model.
  - Colour.
- Added an explicit client confirmation gate after vehicle details are entered or OCR-prefilled:
  - The client must confirm the vehicle details before proceeding.
  - If they edit a field, confirmation resets.
  - The confirmed values are the ones intended for the generated mandate form.
- Added copy explaining that OCR can later prefill vehicle details from the licence disk photo, but client-confirmed values remain the source of truth.
- Added first-class client profile fields for entity type and referral source.
- Added a database migration for those client profile fields and updated seed data.
- Updated admin and supplier views to show entity type context.
- Removed a stale duplicate mandate PDF generator file.

## Validation completed

- Ran lint successfully.
- Ran production build successfully.
- Applied the new database migration locally.
- Refreshed seed data locally.
- Smoke-checked the `/apply` public application page.

## Decisions still needed

- Confirm the final document list for each ownership category:
  - Private owner.
  - Deceased estate.
  - Company or trust.
  - Non-SA citizen.
- Confirm whether proof of address must be exactly 3 calendar months or 90 days.
- Confirm whether OCR is required for launch or whether manual vehicle detail entry with later OCR enhancement is acceptable.
- Confirm payment options for launch:
  - Paystack.
  - EFT.
  - Whether proof of EFT payment is required before admin review.
- Confirm production storage and access rules for uploaded documents.
- Confirm production handling of ID/passport numbers in generated PDFs.
- Confirm whether document resubmissions should:
  - Replace the active file only.
  - Keep all versions.
  - Keep versions only for compliance/audit scenarios.

## Recommended next build steps

- Persist the public `/apply` intake flow into real client and application records.
- Connect uploaded documents from the public flow to the application document records.
- Replace the visual signature placeholder in the public flow with the existing working signature pad.
- Generate the mandate PDF from confirmed client, vehicle and signature data.
- Add the payment request step after document and mandate submission.
- Add OCR as a prefill helper for licence disk vehicle details once the core manual flow is stable.

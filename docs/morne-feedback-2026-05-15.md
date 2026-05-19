# Morne Feedback - 2026-05-15

## Product direction confirmed today

- License Hub needs a public-facing landing page before the application flow.
- The public home page should explain what License Hub does and then route clients into `/apply`.
- Client records should be reusable as a client database, not duplicated in a second table.
- Admin approval must be blocked until required documents are uploaded and accepted.
- Uploaded documents can be opened while still pending review; `Pending` means awaiting admin review, not missing.
- Admin needs document-level Accept and Reject controls.
- Admin needs filters on the application queue.
- Supplier work needs clearer operational context:
  - Urgency before the handoff.
  - `!` for urgent.
  - `!!` for very urgent.
  - Internal order comments visible to admin and supplier.
  - Supplier feedback retained as order history.
- Licence disk extraction should move from local Tesseract OCR to OpenAI vision extraction, while manual confirmation remains the source of truth.

## Work completed today

- Added an admin client database page at `/admin/clients`.
- Added searchable client lookup across:
  - Name.
  - Cellphone.
  - Email.
  - City.
  - Postal code.
  - Application number.
  - Registration number.
  - VIN/chassis.
- Added client profile summaries with:
  - Entity type.
  - Referral source.
  - Address.
  - Latest application.
  - Payment summary.
  - Application count.
- Replaced the internal test-style home page with a public License Hub landing page.
- Added a generated public hero image asset for the website.
- Added public sections explaining:
  - What License Hub does.
  - Duplicate Certificate.
  - Change of Ownership.
  - Licence Renewal.
  - How the application flow works.
  - What documents clients should have ready.
- Cleaned up the `/apply` intro by removing the redundant `Proceed` and `Public application` buttons.
- Replaced local Tesseract licence disk OCR with OpenAI vision extraction.
- Added structured AI extraction for:
  - Registration number.
  - VIN/chassis.
  - Make.
  - Model.
  - Confidence.
  - Manual-review flag.
- Updated public intake copy from OCR to AI scan.
- Removed the unused `tesseract.js` dependency.
- Added OpenAI environment placeholders:
  - `OPENAI_API_KEY`.
  - `OPENAI_LICENSE_DISK_MODEL`.
- Added an admin approval readiness gate:
  - `Approve` is hidden when required documents are missing or not accepted.
  - The selected review panel shows which requirement blocks approval.
  - The server also blocks approval if a crafted request tries to bypass the UI.
- Added per-document admin review controls:
  - Open document.
  - Accept.
  - Reject with a required reason.
- Rejections now move the application into `Documents Resubmit Required`.
- Refreshed the supplier page into a supplier desk:
  - Queue metrics.
  - Clickable production queue.
  - Selected order details.
  - Document pack cards.
  - Status-specific supplier actions.
  - Clear empty and waiting states.
- Added supplier urgency:
  - Normal.
  - Urgent.
  - Very urgent.
- Added red urgency markers on admin and supplier line items.
- Added shared order comment history:
  - Admin can add internal supplier handoff notes.
  - Supplier can add feedback.
  - Comments stay attached to the order.
- Added admin filters for:
  - Search.
  - Status.
  - Payment.
  - Documents.
  - Urgency.
  - Service.
- Kept admin filters in the URL query string so filtered views can be refreshed or shared.
- Changed mandate form wording from `Client signature` to `Signature`.
- Added the root hydration warning suppression for browser-extension-injected HTML attributes.

## Validation completed

- Ran Prisma generation after schema changes.
- Applied the new supplier urgency and order comments migration locally.
- Ran lint successfully after the changes.
- Ran production build successfully after the changes.
- Smoke-checked the admin page for:
  - Filters.
  - Supplier handoff controls.
  - Document Accept/Reject controls.
  - Approval blocked when documents are not accepted.
- Smoke-checked the supplier page for:
  - Supplier desk layout.
  - Order comments.
  - Supplier feedback.
  - Urgency display.

## Important implementation notes

- `Pending` documents are not necessarily missing. A pending document can be uploaded and openable, but it has not yet been accepted or rejected by admin.
- Application approval now requires required documents to be `Accepted`, not merely uploaded.
- The AI licence disk scan requires `OPENAI_API_KEY` in the local/production environment.
- AI extraction is still only a prefill assist. The manually confirmed vehicle fields remain the values used for the mandate form.
- Supplier urgency does not skip document review or approval gates. It only communicates priority once the order moves through the workflow.
- Supplier comments and admin notes are now persisted as order history.

## Decisions still needed

- Confirm final pricing for each service.
- Confirm payment methods for launch:
  - Paystack.
  - EFT.
  - Whether proof of EFT upload is required.
- Confirm delivery rules and pricing.
- Confirm whether delivery applies to all services or only specific services.
- Confirm final document lists for:
  - Duplicate Certificate.
  - Change of Ownership.
  - Licence Renewal.
  - Private owner.
  - Deceased estate.
  - Company or trust.
  - Non-SA citizen.
- Confirm whether proof of address validity is exactly 3 calendar months or 90 days.
- Confirm production storage and access rules for uploaded documents and generated mandate PDFs.
- Confirm production handling of ID/passport values on generated forms.
- Confirm who may set supplier urgency and whether urgent orders should also trigger notifications.
- Confirm whether supplier feedback should notify admin immediately or only appear in the order history.

## Recommended next build steps

- Build the real payment step:
  - Show service fee.
  - Ask whether delivery is required.
  - Add delivery cost if selected.
  - Confirm/change address if delivery is selected.
  - Create payment instructions or Paystack payment link.
- Improve admin document review ergonomics:
  - Clearer labels for missing vs uploaded-awaiting-review vs accepted vs rejected.
  - Possibly add one-click bulk accept after documents are inspected.
- Add notification behavior for supplier comments and urgent handoffs if required.
- Add production-ready storage rules for uploaded files and generated PDFs.
- Add authentication/role protection for admin and supplier areas.

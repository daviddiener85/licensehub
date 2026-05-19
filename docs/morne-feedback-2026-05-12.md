# Morne Feedback - 2026-05-12

## Work completed today

- The project specification was updated to v1.8 and saved as the current formal amendment.
- The client flow was adjusted around a document-first process:
  - Upload ID photo.
  - Upload licence disk photo.
  - Upload proof of address dated within the last 3 months.
  - Complete the mandate form and capture the client signature.
- The client page was simplified so the client only sees the steps required to submit.
- The generated mandate form is no longer shown back to the client after completion. It is intended for admin and supplier use.
- The submitted state was added so completed sections collapse into clear submitted rows.
- Resubmission was added so the client can reopen the submitted document or mandate sections and replace the active files.
- Upload completion states were improved:
  - Image previews show where supported.
  - Uploaded files that cannot be previewed still show a completion state.
  - Required fields must be completed before the client can proceed.
- Proof-of-address date validation was added so a document older than 3 months blocks submission.
- The mandate PDF was cleaned up for traffic department use:
  - Removed the verification checklist.
  - Removed internal handling notes from the visible PDF.
  - Removed the duplicate salutation.
  - Improved signature spacing.
  - Added the uploaded ID image into the generated document area.
  - Standardised test ID number usage to `1234567890123`.

## Scope changes now captured in v1.8

- Entity type selection is now part of the required client profile flow.
- Different document requirements are now defined for:
  - Private owner.
  - Deceased estate.
  - Company or trust.
  - Non-SA citizen.
- Referral source must be captured when creating a client profile.
- Client-side document validation and resubmission are now formal requirements.
- Mandate PDF visibility is now restricted to admin and supplier users.
- Document version handling is now a business decision before final sign-off.

## Decisions needed

- Confirm document resubmission handling:
  - Option A: keep only the latest active file.
  - Option B: keep all submitted versions.
  - Option C: keep all versions only where compliance or audit review requires it.
- Confirm final document requirements for each entity type.
- Confirm whether the proof-of-address rule must be exactly 3 calendar months or 90 days.
- Confirm the final Paystack and EFT proof-of-payment requirements.
- Confirm WhatsApp message templates and Meta access requirements.
- Confirm production storage and access rules for uploaded documents.
- Confirm the production approach for secure ID number handling in generated PDFs.

## Short-term plan

### Tomorrow

- Review v1.8 with Morne and confirm the resubmission/versioning decision.
- Confirm the final document list per entity type before expanding the client flow further.
- Check the current demo flow end to end on mobile.
- Tidy any remaining wording and spacing issues in the client submission screens and generated mandate PDF.
- Confirm which items should be treated as in-scope foundation work and which should be logged as new scope.

### This week

- Add the entity type selection flow and connect it to the correct document requirements.
- Add the referral source field to client profile creation.
- Refine admin review visibility for submitted documents and mandate PDFs.
- Define the production document storage approach.
- Define the production ID number handling approach for traffic department PDFs.
- Prepare the next implementation batch for payment handling, WhatsApp updates and OCR once business decisions are confirmed.

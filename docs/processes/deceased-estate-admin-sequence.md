# Deceased Estate Admin Sequence

This checklist defines the operational sequence for a `Deceased estate` application from submission to dispatch.

## 1. Client Submission

Client submits via `/apply` with:

- Identity details and address
- Ownership type set to `Deceased estate`
- Vehicle details confirmed
- Required uploads:
  - Executor/representative ID photo
  - Death certificate
  - Executor authority document
  - Licence disk photo
  - Proof of address
- Signed mandate form
- EFT selected (current launch mode)
- Delivery preference and delivery address confirmation if delivery is selected

Structured estate details should also be captured:

- Estate name/reference
- Executor/letter reference number
- Representative full name
- Representative role/capacity

## 2. System Creates Records

On successful submit, the system creates:

- `Client` and `Application` record
- `Payment` record (`EFT`, `PENDING`)
- Document records for uploaded files (including supporting docs as `OTHER`)
- `MandateFormSubmission` record
- Status history event for submission/start

## 3. Admin Payment Gate

In `/admin`:

- Action: `Confirm EFT`
- Expected result:
  - payment status `CONFIRMED`
  - application status `PENDING_REVIEW`

## 4. Admin Estate And Document Review

Admin validates both:

- Entered estate/executor details
- Supporting estate documents

Required review set:

- ID photo presence (mandate submission)
- Licence disk photo
- Proof of address
- Mandate form PDF
- Death certificate
- Executor authority document

Rules:

- Use per-document `Accept` or `Reject`
- Rejection requires reason
- Use AI verification notes (if enabled) as support, not automatic decision

## 5. Resubmission Loop (If Needed)

If any required document fails:

- Action: `Resubmit`
- Application status: `DOCUMENTS_RESUBMIT_REQUIRED`
- Client replaces required uploads
- Admin re-reviews

Repeat until all required docs are accepted.

## 6. Approval Gate

Admin may approve only when all required documents are accepted and estate authority is clear.

- Action: `Approve`
- Status moves to `AT_SUPPLIER`

## 7. Supplier Processing

- `AT_SUPPLIER` -> `SUPPLIER_PRODUCED`
- `SUPPLIER_PRODUCED` -> `RETURNING_TO_LICENSE_HUB`

## 8. Final Admin Handling

- `Returned` -> `DOCUMENT_RETURNED`
- `Dispatch` -> `DISPATCHED`

## 9. Definition Of Done

Complete when:

- EFT confirmed
- All required docs accepted
- Estate authority checks complete
- Supplier cycle complete
- Application dispatched


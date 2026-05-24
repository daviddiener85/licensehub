# Non-SA Citizen Admin Sequence

This checklist defines the operational sequence for a `Non-SA citizen` application from submission to dispatch.

## 1. Client Submission

Client submits via `/apply` with:

- Identity details and address
- Ownership type set to `Non-SA citizen`
- Vehicle details confirmed
- Required uploads:
  - Passport or traffic register identity document
  - Licence disk photo
  - Proof of address
- Signed mandate form
- EFT selected (current launch mode)
- Delivery preference and delivery address confirmation if delivery is selected

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

## 4. Admin Identity And Document Review

Required review set:

- ID photo/passport presence and clarity (from upload + mandate context)
- Licence disk photo
- Proof of address
- Mandate form PDF

Rules:

- Verify uploaded identity document corresponds with entered identity number/details
- Use per-document `Accept` or `Reject`
- Rejection requires reason
- Use AI verification notes (if enabled) as support, not auto-decision

## 5. Resubmission Loop (If Needed)

If any required document fails:

- Action: `Resubmit`
- Application status: `DOCUMENTS_RESUBMIT_REQUIRED`
- Client replaces required uploads
- Admin re-reviews

Repeat until all required docs are accepted.

## 6. Approval Gate

Admin may approve only when all required documents are accepted.

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
- Identity checks complete for non-SA flow
- Supplier cycle complete
- Application dispatched


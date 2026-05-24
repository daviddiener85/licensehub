# Private Individual Admin Sequence

This checklist defines the operational sequence for a `Private owner` application from submission to dispatch.

## 1. Client Submission

Client submits via `/apply` with:

- Identity details and address
- Ownership type set to `Private owner`
- Vehicle details confirmed
- Required uploads:
  - ID photo
  - Licence disk photo
  - Proof of address
- Signed mandate form
- Payment method set to EFT (current launch mode)
- Delivery preference and delivery address confirmation if delivery is selected

## 2. System Creates Records

On successful submit, the system creates:

- `Client` and `Application` record
- `Payment` record:
  - method: `EFT`
  - status: `PENDING`
- Required document records:
  - `LICENCE_DISK_PHOTO`
  - `PROOF_OF_ADDRESS`
  - `MANDATE_FORM`
- `MandateFormSubmission` record
- Status history event for submission/start

## 3. Admin Payment Gate

In `/admin`, payment must be confirmed first:

- Action: `Confirm EFT`
- Expected result:
  - payment status moves to `CONFIRMED`
  - application status moves to `PENDING_REVIEW`

## 4. Admin Document Review

For `Private owner`, admin reviews and accepts/rejects:

- ID photo presence (from mandate submission)
- Licence disk photo
- Proof of address
- Completed mandate form PDF

Rules:

- Use per-document `Accept` or `Reject`
- Rejection requires a reason
- `Accept All Pending` may be used only after inspection

## 5. Resubmission Loop (If Needed)

If any required document is rejected:

- Action: `Resubmit` request
- Application status: `DOCUMENTS_RESUBMIT_REQUIRED`
- Client re-uploads/replaces required files
- Application returns for admin review

Loop until all required documents are accepted.

## 6. Approval Gate

Admin may only approve when all required private-owner documents are accepted.

- Action: `Approve`
- Application status moves to supplier queue (`AT_SUPPLIER`)

## 7. Supplier Processing

Supplier processes and updates:

- `AT_SUPPLIER` -> `SUPPLIER_PRODUCED`
- `SUPPLIER_PRODUCED` -> `RETURNING_TO_LICENSE_HUB`

## 8. Final Admin Handling

On receipt and handoff:

- Action: `Returned` -> status `DOCUMENT_RETURNED`
- Action: `Dispatch` -> status `DISPATCHED`

## 9. Definition Of Done

Application is operationally complete when:

- EFT is confirmed
- Required private-owner documents are accepted
- Supplier production and return steps are complete
- Application is dispatched to client


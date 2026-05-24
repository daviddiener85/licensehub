# Private Owner UAT Script

Date:
Tester:
Environment:

## Steps

1. Open `/apply`.
2. Select `Duplicate Certificate`.
3. Complete identity + address + consent.
4. Select ownership `Private owner`.
5. Upload licence disk photo and confirm vehicle details.
6. Upload required docs (ID, licence disk, proof of address), sign mandate, proceed to payment.
7. Select delivery on/off and submit.
8. On `/apply/submitted`, upload EFT proof.
9. In `/admin`, confirm EFT.
10. Accept/reject documents and verify checklist updates.
11. Approve only when required docs are accepted.
12. Validate supplier flow: produced -> returning.
13. Validate admin close-out: returned -> dispatched.

## Expected

- Application created with EFT pending payment.
- EFT proof appears as document.
- Admin checklist shows pass/fail accurately.
- Approval blocked until required docs accepted.


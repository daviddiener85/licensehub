# Morne Feedback

## Summary

This week we closed major intake, payment, mandate, and admin-review gaps and moved the flow closer to launch-ready behavior for EFT-first operations.

## Work Completed

- Stabilized the public intake flow from `/apply` through to submission.
- Added delivery fee support in services and included delivery fees in payable totals.
- Set Duplicate Certificate test pricing to `R499.00`.
- Kept EFT as the active payment path while Paystack awaits provider review.
- Improved post-submit clarity with stronger “what happens next” guidance.
- Added and improved EFT proof-of-payment flow, including upload state clarity and replace-proof behavior.
- Improved step progression UX with automatic scroll/focus and progress-strip visibility during transitions.
- Simplified and reordered intake sequence:
  - moved **Vehicle Relationship** ahead of **Who You Are**
  - simplified ownership model so private-owner includes SA and foreign individuals
  - introduced required citizenship selection in Who You Are before showing the rest of the form
- Updated identity capture rules:
  - SA path uses `ID number`
  - foreign path uses separate required `Passport number` and `TRN number`
- Updated non-SA supporting-document requirements to require both:
  - `Traffic register document (TRN)`
  - `Passport document`
- Removed unnecessary extra non-SA ID-photo blocker while retaining identity document requirements.
- Updated mandate identity handling so generated forms show actual captured identity values for new submissions.
- Updated priced EFT submission behavior so fixed-fee applications enter awaiting-payment flow directly with pending payment records created immediately.
- Updated admin payment-status semantics for duplicate/EFT flow:
  - `Pending payment` when no proof of payment exists
  - `Verify payment` when proof of payment is uploaded
- Added in-page admin document quick view with:
  - close action
  - full-screen action
  - open-original fallback
  - image zoom controls (buttons, wheel zoom, drag pan, touch pinch, reset)
- Added admin review correction action to move an incorrectly reviewed document back to pending.
- Replaced generic `Other document` labels in admin with contextual document names.
- Updated review audit notes to include specific document names for accept/reject/reset actions.
- Collapsed review audit entries behind an expandable dropdown.
- Added admin empty-state protection when no applications exist to prevent selected-application runtime crashes.
- Removed cancelled test applications from the database when requested.

## Validation

- Lint checks were run after each major set of changes and passed.
- Production/dev flow checks were completed while iterating on intake, payment, and admin-review behavior.

## Current Position

- EFT-first duplicate-document flow is now significantly more operational for UAT.
- Admin review tooling is stronger, with better document clarity, correction controls, and audit readability.
- Intake and identity capture rules are aligned more closely to expected real-world client scenarios.
- Remaining work is primarily polish, consistency, and final business-rule confirmation rather than foundational flow construction.

# Morne Feedback - 2026-05-24

## Summary

Today we closed key client-flow and admin-flow gaps and stabilized EFT-first operations for launch testing.

## Work completed today

- Hardened the client intake flow end-to-end from `/apply` to submission.
- Added delivery fee support in services and included delivery in final payment totals.
- Set Duplicate Certificate UAT base fee to `R499.00`.
- Finalized EFT-only payment flow for now and kept card path deferred.
- Seeded fictional EFT banking details for local/UAT and surfaced them on the submitted page.
- Fixed "Request Payment" blockers caused by hidden-step validation and file handoff issues.
- Removed duplicate licence disk collection in later checklist/mandate steps once loaded in vehicle details.
- Improved EFT proof upload usability:
  - clear file selection control
  - selected filename visibility
  - upload pending state
  - success confirmation
  - latest uploaded-proof visibility
- Made the submitted page less open-ended by adding explicit "What happens next" guidance and a cleaner uploaded/replace-proof state.
- Added automatic queued WhatsApp communication record on public application submission with:
  - order received confirmation
  - reference number
  - notice that documents will be reviewed
  - notice that client updates will follow
- Extended process and UAT documentation:
  - entity-specific admin sequences
  - UAT scripts per entity type
  - UAT gap log updates
- Added auth and middleware foundations for protected role flows.

## Validation completed

- Ran lint successfully after changes.
- Ran production build successfully after changes.
- Completed local UAT smoke checks across:
  - public intake submission
  - EFT proof upload
  - submitted-page payment instruction flow

## Current launch position

- EFT-first workflow is operational and significantly more stable than the previous baseline.
- Client messaging and post-submit direction are now clearer and less ambiguous.
- WhatsApp entries are queued as communication records; provider-send integration remains the next optional layer if required.

## Commit snapshot

- Branch: `work/mandate-pdf-refinement`
- Commit: `ab9c12f`

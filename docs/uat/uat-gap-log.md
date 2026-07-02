# UAT Gap Log

## 2026-07-02 - Candidate Improvement Resolution Check

Verified against current code (not a browser UAT pass) while auditing what remains before launch.

- RESOLVED: "Add 'required vs optional' marker on admin checklist rows" — implemented as the `scope: "Required" | "Conditional"` field rendered per checklist row (`src/app/admin/page.tsx`), shipped in the 2026-06-16 UAT polish pass (see `docs/WORK_LOG.md`).
- RESOLVED: "Add toast/success message after EFT proof upload" — implemented as an inline success banner ("Your EFT proof has been uploaded.") plus latest-uploaded-proof filename display on `/apply/submitted` (`src/app/apply/submitted/page.tsx`), shipped in the same 2026-06-16 pass.
- STILL OPEN: "Add explicit labels for `OTHER` supporting docs in admin based on entity type and expected slot" — no matching implementation found.

## 2026-05-24 - Initial Baseline

Status: Not executed manually yet in browser. Log below captures known or likely gaps to validate during UAT execution.

### Open Checks

- Verify `/apply/submitted` EFT proof upload UX on mobile and desktop.
- Verify admin checklist is clear enough for operations without extra training.
- Verify entity supporting document mapping by upload order (`OTHER` docs) remains consistent for all entity flows.
- Verify AI verification notes are understandable and non-blocking when enabled.

### Candidate Improvements

- Add explicit labels for `OTHER` supporting docs in admin based on entity type and expected slot.
- Add “required vs optional” marker on admin checklist rows.
- Add toast/success message after EFT proof upload.

## 2026-05-24 - UAT Session 1 (Preflight)

### Automated Preflight Result: PASS

- Build passes (`next build`)
- Lint passes (`eslint`)
- Route protection is present (`/admin`, `/supplier` via middleware)
- EFT-only server enforcement present
- EFT proof upload action present and wired to submitted page
- Admin checklist panel present
- Entity required-document gating is enabled

### Manual Execution Queue

1. Run `private-owner-uat-script.md`
2. Run `company-or-trust-uat-script.md`
3. Run `deceased-estate-uat-script.md`
4. Run `non-sa-citizen-uat-script.md`

### Manual Results

- Pending manual browser execution.

## 2026-05-24 - UAT Session 1A (Private Owner Backend Simulation)

### Scope

- Backend/data-path simulation using Prisma records and workflow-equivalent transitions.
- Not a full browser/manual UI run.

### Result: PASS (Backend)

- Private owner required docs accepted state evaluated correctly.
- EFT proof document (`PROOF_OF_EFT_PAYMENT`) present and detectable.
- EFT pending -> confirmed transition behaves as expected in data model.
- Approval transition simulation to `AT_SUPPLIER` succeeded with confirmed EFT and accepted docs.

### Evidence

- Simulated application id: `UAT-PO-1779626334750`
- Checks:
  - `hasEftProof=true`
  - `eftPending=true`
  - `requiredAccepted=true`
  - `eftConfirmed=true`
  - `statusAfterApprove=AT_SUPPLIER`

### Remaining

- Run full manual browser flow for private owner (UI interactions, upload UX, checklist readability).

## 2026-05-24 - UAT Session 1B (Entity Backend Simulations)

### Scope

- Backend/data-path simulations for:
  - Company or trust
  - Deceased estate
  - Non-SA citizen
- Includes EFT-proof presence, base doc acceptance, supporting document persistence, entity details persistence.

### Result: PASS (Backend)

- EFT banking details configured for submitted-page display (`eftBankConfigured=true`).
- Company/trust scenario:
  - `hasEftProof=true`
  - `hasBaseDocsAccepted=true`
  - `otherAcceptedCount=2`
  - `entityFieldsPresent=true`
- Deceased estate scenario:
  - `hasEftProof=true`
  - `hasBaseDocsAccepted=true`
  - `otherAcceptedCount=2`
  - `entityFieldsPresent=true`
- Non-SA citizen scenario:
  - `hasEftProof=true`
  - `hasBaseDocsAccepted=true`
  - `otherAcceptedCount=1`
  - `entityFieldsPresent=false` (expected for this flow)

### Evidence

- Company app id: `UAT-COMPANY-1779626770839`
- Estate app id: `UAT-ESTATE-1779626770886`
- Non-SA app id: `UAT-NONSA-1779626770902`

### Remaining

- Run manual browser UAT for all entity scripts to confirm:
  - Upload UX and labels
  - Submitted page EFT instruction clarity
  - Admin checklist readability and operational clarity

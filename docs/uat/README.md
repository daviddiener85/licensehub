# UAT Scripts

Before starting a manual UAT pass, run the automated smoke gate:

- `npm run lint`
- `npm run build`
- `npm run test:regression`

`npm run test:regression` checks the admin WhatsApp template buttons, the add-charge flow, and supplier print behavior so obvious UI regressions are caught before manual testing starts.

Use these scripts to run full end-to-end checks per entity type:

- `private-owner-uat-script.md`
- `company-or-trust-uat-script.md`
- `deceased-estate-uat-script.md`
- `non-sa-citizen-uat-script.md`

Record findings in:

- `uat-gap-log.md`

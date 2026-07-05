# License Hub

Vehicle document services workflow platform based on the v1.2 working specification.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma

## Local Setup

Install dependencies:

```bash
npm install
```

Create environment variables:

```bash
cp .env.example .env
```

Update `DATABASE_URL` in `.env`. If you are running the app locally, also change `APP_BASE_URL` from `https://www.lichub.co.za` to your local URL. Then generate the Prisma client:

```bash
npm run prisma:generate
```

Apply migrations once a PostgreSQL database is available:

```bash
npm run prisma:migrate
```

Seed launch data:

```bash
npm run db:seed
```

Run the app:

```bash
npm run dev
```

## Verification

Before shipping or handing off a change, run:

```bash
npm run lint
npm run build
npm run test:regression
```

`npm run test:regression` covers the current UI regressions around admin WhatsApp templates, additional charge submission, and supplier pack printing. It expects the local app and database to be available.

The same validation path now runs in GitHub Actions on push, pull request, and manual dispatch via [`.github/workflows/ci.yml`](</Users/daviddiener/Documents/License Hub/App/.github/workflows/ci.yml>).

## Paystack Setup

Paystack is currently awaiting provider review, so the active launch path still uses EFT. When we do wire Paystack in, the relevant environment variables are:

- `PAYSTACK_PUBLIC_KEY` for frontend checkout initialization.
- `PAYSTACK_SECRET_KEY` for server-side API calls.
- `PAYSTACK_WEBHOOK_SECRET` for verifying webhook signatures if you want a separate override; the code falls back to the secret key.

Use Paystack test keys while developing and testing. Swap to live keys only after the integration is approved for production use.

`APP_BASE_URL` should point at the live public domain, currently `https://www.lichub.co.za`, because it is used for client status links and Paystack callback URLs.

Callback and webhook URLs are configured in the Paystack dashboard, not in `.env`.

Run `npm run check:paystack` to verify the local env setup before testing checkout.

Run `npm run dry-run:paystack -- --application-id LH-DRYRUN-0001 --email test@example.com --amount 499.00` to print a sample Paystack initialize payload without making a network request.

## WhatsApp Setup

WhatsApp is wired to the Meta Cloud API and supports both outbound admin messages and inbound client replies.

- `WHATSAPP_PROVIDER` must be `meta_cloud_api`.
- `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are required for sending.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` must match the value configured in Meta's webhook subscription.
- `WHATSAPP_APP_SECRET` is required so webhook signatures can be verified.
- `APP_BASE_URL` must be the public URL Meta can reach so the webhook URL resolves correctly.

The webhook endpoint is `https://your-domain/api/webhooks/whatsapp`.

Run `npm run check:whatsapp` after setting env vars to confirm the token can read the configured phone number and that the webhook URL is derived correctly.

Inbound WhatsApp messages are matched to the most recent application for the sender's phone number and then shown in the admin application `messages` view alongside outbound staff messages.

## First Build Targets

1. Client unique-link application flow.
2. Admin document review and EFT confirmation.
3. Supplier print-only portal with `Produced` and `Returning to License Hub` status actions.
4. Paystack review readiness, private file storage, email, SMS, and OCR integrations.

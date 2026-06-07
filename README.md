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

Update `DATABASE_URL` in `.env`, then generate the Prisma client:

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

## Paystack Setup

Paystack is currently awaiting provider review, so the active launch path still uses EFT. When we do wire Paystack in, the relevant environment variables are:

- `PAYSTACK_PUBLIC_KEY` for frontend checkout initialization.
- `PAYSTACK_SECRET_KEY` for server-side API calls.
- `PAYSTACK_WEBHOOK_SECRET` for verifying webhook signatures if you want a separate override; the code falls back to the secret key.

Use Paystack test keys while developing and testing. Swap to live keys only after the integration is approved for production use.

Callback and webhook URLs are configured in the Paystack dashboard, not in `.env`.

Run `npm run check:paystack` to verify the local env setup before testing checkout.

Run `npm run dry-run:paystack -- --application-id LH-DRYRUN-0001 --email test@example.com --amount 499.00` to print a sample Paystack initialize payload without making a network request.

## First Build Targets

1. Client unique-link application flow.
2. Admin document review and EFT confirmation.
3. Supplier print-only portal with `Produced` and `Returning to License Hub` status actions.
4. Paystack review readiness, private file storage, email, SMS, and OCR integrations.

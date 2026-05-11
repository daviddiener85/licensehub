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

## First Build Targets

1. Client unique-link application flow.
2. Admin document review and EFT confirmation.
3. Supplier print-only portal with `Produced` and `Returning to License Hub` status actions.
4. Paystack, private file storage, email, SMS, and OCR integrations.

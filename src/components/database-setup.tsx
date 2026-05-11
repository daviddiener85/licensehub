export function DatabaseSetup({ message }: { message?: string }) {
  return (
    <main className="min-h-screen bg-[#f7f5ef] px-6 py-10 text-[#1f2724] sm:px-8">
      <section className="mx-auto max-w-3xl border border-[#d8d1c3] bg-white p-6">
        <p className="text-sm font-semibold uppercase text-[#8a6a2a]">Database setup needed</p>
        <h1 className="mt-3 text-2xl font-semibold">Connect PostgreSQL to view live workflow data</h1>
        <p className="mt-4 text-sm leading-6 text-[#52615b]">
          The pages are wired to Prisma now, but the local database is not reachable from the current
          `DATABASE_URL`. Start PostgreSQL, update `.env`, then run the schema and seed commands.
        </p>
        {message ? (
          <p className="mt-4 border border-[#eee8dc] bg-[#fffdf8] p-3 text-xs text-[#6b5e4f]">{message}</p>
        ) : null}
        <div className="mt-5 space-y-2 text-sm font-medium">
          <p>`npm run prisma:migrate`</p>
          <p>`npm run db:seed`</p>
          <p>`npm run dev`</p>
        </div>
      </section>
    </main>
  );
}

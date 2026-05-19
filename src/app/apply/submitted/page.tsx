import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ApplicationSubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ application?: string }>;
}) {
  const { application } = await searchParams;

  return (
    <main className="min-h-screen bg-[#f7f5ef] px-4 py-10 text-[#1f2724] sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl border border-[#d8d1c3] bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase text-[#6b5e4f]">License Hub</p>
        <h1 className="mt-4 text-3xl font-semibold">Application received</h1>
        <p className="mt-4 text-sm leading-6 text-[#52615b]">
          The client and vehicle details have been saved. License Hub can now continue with document capture, mandate
          generation and payment handling for this application.
        </p>

        {application ? (
          <div className="mt-6 border border-[#eee8dc] bg-[#fffdf8] p-4">
            <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Application reference</p>
            <p className="mt-2 text-2xl font-semibold">{application}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/apply" className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]">
            Start another application
          </Link>
          <Link href="/" className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
            Back to website
          </Link>
        </div>
      </section>
    </main>
  );
}

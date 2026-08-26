import Link from "next/link";

import { formatMoney } from "@/lib/applications";
import { listAdminReferrals, listReferralSourceOptions, referralAmountPaid } from "@/lib/referrals";

export const dynamic = "force-dynamic";

function textParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; referral?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = textParam(params.q);
  const referralSource = textParam(params.referral);
  const dateFrom = textParam(params.from);
  const dateTo = textParam(params.to);

  const [applications, referralSourceOptions] = await Promise.all([
    listAdminReferrals({ query, referralSource, dateFrom, dateTo }),
    listReferralSourceOptions(),
  ]);

  const totalAmountPaid = referralAmountPaid(applications.flatMap((application) => application.payments));
  const uniqueReferralSources = new Set(applications.map((application) => application.referralSource)).size;
  const hasActiveFilters = Boolean(query || referralSource || dateFrom || dateTo);

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-8">
        <header className="flex flex-col gap-4 border-b border-[#d8d1c3] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-medium text-[#6b5e4f]">
              Back to admin
            </Link>
            <h1 className="mt-3 text-2xl font-semibold sm:mt-4 sm:text-3xl">Referrals Report</h1>
            <p className="mt-2 text-sm text-[#52615b]">
              Every application that recorded a referral, with the client, register number, and amount paid.
            </p>
          </div>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="border border-[#d8d1c3] bg-white p-4 text-sm">
            <span className="block text-xs font-semibold uppercase text-[#6b5e4f]">Referred applications</span>
            <span className="mt-2 block text-2xl font-semibold">{applications.length}</span>
          </div>
          <div className="border border-[#d8d1c3] bg-white p-4 text-sm">
            <span className="block text-xs font-semibold uppercase text-[#6b5e4f]">Referral sources</span>
            <span className="mt-2 block text-2xl font-semibold">{uniqueReferralSources}</span>
          </div>
          <div className="border border-[#d8d1c3] bg-white p-4 text-sm">
            <span className="block text-xs font-semibold uppercase text-[#6b5e4f]">Total amount paid</span>
            <span className="mt-2 block text-2xl font-semibold">{formatMoney(totalAmountPaid)}</span>
          </div>
        </section>

        <form className="mt-6 grid gap-3 border border-[#d8d1c3] bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-semibold sm:col-span-2 lg:col-span-1">
            Search
            <input
              name="q"
              defaultValue={query}
              placeholder="Application, register, client, cellphone"
              className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-semibold">
            Referral source
            <select name="referral" defaultValue={referralSource} className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal">
              <option value="">All referral sources</option>
              {referralSourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            From date
            <input
              type="date"
              name="from"
              defaultValue={dateFrom}
              max={dateTo || undefined}
              className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-semibold">
            To date
            <input
              type="date"
              name="to"
              defaultValue={dateTo}
              min={dateFrom || undefined}
              className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
            />
          </label>
          <div className="flex items-end gap-2">
            <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
              Apply filters
            </button>
            {hasActiveFilters ? (
              <Link className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]" href="/admin/referrals">
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <section className="mt-6 space-y-3 md:space-y-0 md:overflow-hidden md:border md:border-[#d8d1c3] md:bg-white">
          <div className="hidden grid-cols-[0.8fr_1.2fr_0.8fr_1.1fr_1fr_1.1fr_0.9fr] border-b border-[#d8d1c3] bg-[#fffdf8] px-4 py-3 text-xs font-semibold uppercase text-[#6b5e4f] md:grid">
            <span>Date</span>
            <span>Application reference</span>
            <span>Register number</span>
            <span>Client name</span>
            <span>Client contact</span>
            <span>Referral name</span>
            <span>Amount paid</span>
          </div>
          {applications.map((application) => (
            <div
              key={application.id}
              className="grid grid-cols-2 gap-x-3 gap-y-4 border border-[#d8d1c3] bg-white px-4 py-4 text-sm md:grid-cols-[0.8fr_1.2fr_0.8fr_1.1fr_1fr_1.1fr_0.9fr] md:items-center md:gap-2 md:border-x-0 md:border-t-0 md:border-b-[#eee8dc] md:last:border-b-0"
            >
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#6b5e4f] md:hidden">
                  Date
                </span>
                {application.createdAt.toLocaleDateString("en-ZA")}
              </div>
              <div className="col-span-2 min-w-0 md:col-span-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#6b5e4f] md:hidden">
                  Application reference
                </span>
                <Link href={`/admin?application=${application.id}`} className="break-all font-semibold text-[#07315f] md:break-normal">
                  {application.id}
                </Link>
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#6b5e4f] md:hidden">
                  Register number
                </span>
                {application.registrationNumber || "Not captured"}
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#6b5e4f] md:hidden">
                  Client name
                </span>
                {application.client.firstName} {application.client.surname}
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#6b5e4f] md:hidden">
                  Client contact
                </span>
                {application.client.cellphone}
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#6b5e4f] md:hidden">
                  Referral name
                </span>
                {application.referralSource}
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#6b5e4f] md:hidden">
                  Amount paid
                </span>
                {formatMoney(referralAmountPaid(application.payments))}
              </div>
            </div>
          ))}
          {applications.length === 0 ? (
            <div className="px-4 py-8 text-sm text-[#52615b]">No referrals found for these filters.</div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

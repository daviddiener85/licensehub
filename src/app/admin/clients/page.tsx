import Link from "next/link";

import { PaymentStatus } from "@/generated/prisma/client";
import { formatMoney, statusLabel } from "@/lib/applications";
import { listAdminClients } from "@/lib/clients";
import { clientEntityTypeLabels } from "@/lib/entity-requirements";

export const dynamic = "force-dynamic";

function textParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatAddress(client: Awaited<ReturnType<typeof listAdminClients>>[number]) {
  return [
    client.deliveryAddressLine1,
    client.deliveryAddressLine2,
    client.deliverySuburb,
    client.deliveryCity,
    client.deliveryProvince,
    client.deliveryPostalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function latestApplication(client: Awaited<ReturnType<typeof listAdminClients>>[number]) {
  return client.applications[0] ?? null;
}

function paymentLabel(application: NonNullable<ReturnType<typeof latestApplication>>) {
  const payment = application.payments[0];

  if (!payment) {
    return "No payment";
  }

  if (payment.status === PaymentStatus.CONFIRMED) {
    return `${formatMoney(payment.amount)} confirmed`;
  }

  return `${formatMoney(payment.amount)} ${payment.status.toLowerCase()}`;
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const query = textParam((await searchParams).q);
  const clients = await listAdminClients(query);
  const totalApplications = clients.reduce((total, client) => total + client.applications.length, 0);
  const returningClients = clients.filter((client) => client.applications.length > 1).length;

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d8d1c3] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-medium text-[#6b5e4f]">
              Back to admin
            </Link>
            <h1 className="mt-4 text-3xl font-semibold">Client Database</h1>
            <p className="mt-2 text-sm text-[#52615b]">
              Search saved client profiles, contact details, addresses, and their application history.
            </p>
          </div>
          <Link
            className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white"
            href="/admin"
          >
            Create Client Link
          </Link>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="border border-[#d8d1c3] bg-white p-4 text-sm">
            <span className="block text-xs font-semibold uppercase text-[#6b5e4f]">Saved clients</span>
            <span className="mt-2 block text-2xl font-semibold">{clients.length}</span>
          </div>
          <div className="border border-[#d8d1c3] bg-white p-4 text-sm">
            <span className="block text-xs font-semibold uppercase text-[#6b5e4f]">Linked applications</span>
            <span className="mt-2 block text-2xl font-semibold">{totalApplications}</span>
          </div>
          <div className="border border-[#d8d1c3] bg-white p-4 text-sm">
            <span className="block text-xs font-semibold uppercase text-[#6b5e4f]">Returning clients</span>
            <span className="mt-2 block text-2xl font-semibold">{returningClients}</span>
          </div>
        </section>

        <form className="mt-6 flex flex-col gap-3 border border-[#d8d1c3] bg-white p-4 sm:flex-row">
          <label className="flex-1 text-sm font-semibold">
            Search clients
            <input
              name="q"
              defaultValue={query}
              placeholder="Name, cellphone, email, city, application, registration, or VIN"
              className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
            />
          </label>
          <div className="flex items-end gap-2">
            <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
              Search
            </button>
            {query ? (
              <Link className="border border-[#d8d1c3] px-4 py-2 text-sm font-semibold text-[#52615b]" href="/admin/clients">
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <section className="mt-6 overflow-hidden border border-[#d8d1c3] bg-white">
          <div className="grid grid-cols-[1fr_1fr_1.2fr_1fr_1.1fr] border-b border-[#d8d1c3] bg-[#fffdf8] px-4 py-3 text-xs font-semibold uppercase text-[#6b5e4f]">
            <span>Client</span>
            <span>Contact</span>
            <span>Address</span>
            <span>Latest application</span>
            <span>History</span>
          </div>
          {clients.map((client) => {
            const latest = latestApplication(client);

            return (
              <div
                key={client.id}
                className="grid grid-cols-[1fr_1fr_1.2fr_1fr_1.1fr] gap-3 border-b border-[#eee8dc] px-4 py-4 text-sm last:border-b-0"
              >
                <div>
                  <p className="font-semibold">
                    {client.firstName} {client.surname}
                  </p>
                  <p className="mt-1 text-xs text-[#6b5e4f]">{clientEntityTypeLabels[client.entityType]}</p>
                  <p className="mt-1 text-xs text-[#6b5e4f]">{client.referralSource || "Referral not captured"}</p>
                </div>
                <div className="text-[#52615b]">
                  <p>{client.cellphone}</p>
                  <p className="mt-1 break-all">{client.email}</p>
                </div>
                <p className="leading-6 text-[#52615b]">{formatAddress(client)}</p>
                <div>
                  {latest ? (
                    <>
                      <Link href={`/admin?application=${latest.id}`} className="font-semibold text-[#07315f]">
                        {latest.id}
                      </Link>
                      <p className="mt-1 text-xs text-[#6b5e4f]">{latest.service.name}</p>
                      <p className="mt-1 text-xs text-[#52615b]">{statusLabel(latest.currentStatus)}</p>
                    </>
                  ) : (
                    <p className="text-[#52615b]">No applications</p>
                  )}
                </div>
                <div className="text-[#52615b]">
                  <p className="font-semibold text-[#1f2724]">
                    {client.applications.length} {client.applications.length === 1 ? "application" : "applications"}
                  </p>
                  {latest ? <p className="mt-1 text-xs">{paymentLabel(latest)}</p> : null}
                  <p className="mt-1 text-xs">Updated {client.updatedAt.toLocaleDateString("en-ZA")}</p>
                </div>
              </div>
            );
          })}
          {clients.length === 0 ? (
            <div className="px-4 py-8 text-sm text-[#52615b]">No clients found for this search.</div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

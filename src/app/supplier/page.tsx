import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Clock3, FileText, PackageCheck, Printer, Truck } from "lucide-react";

import { ConfirmActionForm } from "@/components/confirm-action-form";
import { DatabaseSetup } from "@/components/database-setup";
import { ApplicationStatus, SupplierUrgency } from "@/generated/prisma/client";
import { listSupplierApplications, statusLabel } from "@/lib/applications";
import { documentHref, documentLabel, documentTypeDescriptions } from "@/lib/documents";
import { clientEntityTypeLabels } from "@/lib/entity-requirements";
import { addSupplierOrderComment, supplierMarkProduced, supplierMarkReturning } from "@/lib/workflow-actions";

export const dynamic = "force-dynamic";

type SupplierOrder = Awaited<ReturnType<typeof listSupplierApplications>>[number];

const dayInMs = 1000 * 60 * 60 * 24;
const metricCards: { label: string; key: "atSupplier" | "produced" | "returning"; icon: LucideIcon }[] = [
  { label: "Ready to produce", key: "atSupplier", icon: Clock3 },
  { label: "Produced", key: "produced", icon: PackageCheck },
  { label: "Returning", key: "returning", icon: Truck },
];

function ageSummary(date: Date | null) {
  if (!date) {
    return "Today";
  }

  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / dayInMs));

  return days === 1 ? "1 day" : `${days} days`;
}

function vehicleSummary(order: SupplierOrder) {
  return [order.vehicleMake, order.vehicleModel, order.vehicleYear].filter(Boolean).join(" ") || "Vehicle details pending";
}

function statusClass(status: string) {
  if (status === ApplicationStatus.AT_SUPPLIER) {
    return "border-[#0f5f58] bg-[#ecf7f5] text-[#0f5f58]";
  }

  if (status === ApplicationStatus.SUPPLIER_PRODUCED) {
    return "border-[#8a6a2a] bg-[#fff8df] text-[#6b5e4f]";
  }

  return "border-[#07315f] bg-[#eef6ff] text-[#07315f]";
}

function urgencyMarker(urgency: SupplierUrgency) {
  if (urgency === SupplierUrgency.VERY_URGENT) {
    return "!!";
  }

  if (urgency === SupplierUrgency.URGENT) {
    return "!";
  }

  return "";
}

function urgencyLabel(urgency: SupplierUrgency) {
  if (urgency === SupplierUrgency.VERY_URGENT) {
    return "Very urgent";
  }

  if (urgency === SupplierUrgency.URGENT) {
    return "Urgent";
  }

  return "Normal";
}

function visibleActions(order: SupplierOrder) {
  if (order.currentStatus === ApplicationStatus.AT_SUPPLIER) {
    return [
      {
        action: supplierMarkProduced,
        label: "Mark Produced",
        message: `Confirm that ${order.id} has been produced?`,
        icon: PackageCheck,
        primary: true,
      },
    ];
  }

  if (order.currentStatus === ApplicationStatus.SUPPLIER_PRODUCED) {
    return [
      {
        action: supplierMarkReturning,
        label: "Returning to License Hub",
        message: `Confirm that ${order.id} is returning to License Hub?`,
        icon: Truck,
        primary: true,
      },
    ];
  }

  return [];
}

export default async function SupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const orders = await listSupplierApplications().catch((error: unknown) => {
    console.error(error);
    return null;
  });

  if (!orders) {
    return <DatabaseSetup message="Supplier orders could not be loaded from PostgreSQL." />;
  }

  const { order: selectedOrderId } = await searchParams;
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? orders[0];
  const atSupplierCount = orders.filter((order) => order.currentStatus === ApplicationStatus.AT_SUPPLIER).length;
  const producedCount = orders.filter((order) => order.currentStatus === ApplicationStatus.SUPPLIER_PRODUCED).length;
  const returningCount = orders.filter((order) => order.currentStatus === ApplicationStatus.RETURNING_TO_LICENSE_HUB).length;

  return (
    <main className="min-h-screen bg-[#f2f0e8] text-[#17211e]">
      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
        <header className="border-b border-[#d6d0c1] pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#6b5e4f]">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
              <h1 className="mt-4 text-3xl font-semibold">Supplier Desk</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#52615b]">
                Work from approved print packs, produce the document, then mark it returning to License Hub.
              </p>
            </div>
            <div className="border border-[#16352d] bg-[#16352d] px-4 py-3 text-sm font-semibold text-white">
              {orders.length} active supplier {orders.length === 1 ? "order" : "orders"}
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          {metricCards.map(({ label, key, icon: Icon }) => (
            <div key={label} className="border border-[#d6d0c1] bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-[#6b5e4f]">{label}</span>
                <Icon className="h-5 w-5 text-[#0f766e]" />
              </div>
              <p className="mt-2 text-3xl font-semibold">
                {key === "atSupplier" ? atSupplierCount : key === "produced" ? producedCount : returningCount}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <aside className="border border-[#d6d0c1] bg-white">
            <div className="border-b border-[#d6d0c1] bg-[#fffdf8] px-4 py-3">
              <h2 className="font-semibold">Production Queue</h2>
              <p className="mt-1 text-xs text-[#6b5e4f]">Oldest approved packs appear first.</p>
            </div>

            <div className="divide-y divide-[#eee8dc]">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/supplier?order=${order.id}`}
                  className={[
                    "block px-4 py-4 transition hover:bg-[#f7f5ef]",
                    selectedOrder?.id === order.id ? "bg-[#fff8df]" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">
                        {order.id}
                        {urgencyMarker(order.supplierUrgency) ? (
                          <span className="ml-2 font-black text-[#b3261e]" title={urgencyLabel(order.supplierUrgency)}>
                            {urgencyMarker(order.supplierUrgency)}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm">
                        {order.client.firstName} {order.client.surname}
                      </p>
                      <p className="mt-1 text-xs text-[#52615b]">
                        {order.registrationNumber || "No registration"} · {vehicleSummary(order)}
                      </p>
                    </div>
                    <span className={["shrink-0 border px-2 py-1 text-xs font-semibold", statusClass(order.currentStatus)].join(" ")}>
                      {statusLabel(order.currentStatus)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6b5e4f]">
                    <span>{clientEntityTypeLabels[order.client.entityType]}</span>
                    <span>·</span>
                    <span>{ageSummary(order.approvedAt)} at supplier</span>
                  </div>
                </Link>
              ))}

              {orders.length === 0 ? (
                <div className="px-4 py-10 text-sm leading-6 text-[#52615b]">
                  No supplier-visible orders right now. Approved applications will appear here once License Hub sends
                  them to the supplier stage.
                </div>
              ) : null}
            </div>
          </aside>

          <article className="border border-[#d6d0c1] bg-white">
            {selectedOrder ? (
              <>
                <div className="border-b border-[#d6d0c1] bg-[#fffdf8] p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase text-[#6b5e4f]">Selected pack</p>
                      <h2 className="mt-2 text-2xl font-semibold">
                        {selectedOrder.id}
                        {urgencyMarker(selectedOrder.supplierUrgency) ? (
                          <span className="ml-2 font-black text-[#b3261e]">
                            {urgencyMarker(selectedOrder.supplierUrgency)}
                          </span>
                        ) : null}
                      </h2>
                      <p className="mt-2 text-sm text-[#52615b]">
                        {selectedOrder.client.firstName} {selectedOrder.client.surname} · {selectedOrder.client.cellphone}
                      </p>
                    </div>
                    <button className="inline-flex items-center justify-center gap-2 border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
                      <Printer className="h-4 w-4" />
                      Print Pack
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    <div className="border border-[#eee8dc] p-3">
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Status</dt>
                      <dd className="mt-2 font-semibold">{statusLabel(selectedOrder.currentStatus)}</dd>
                    </div>
                    <div className="border border-[#eee8dc] p-3">
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Registration</dt>
                      <dd className="mt-2 font-semibold">{selectedOrder.registrationNumber || "Not captured"}</dd>
                    </div>
                    <div className="border border-[#eee8dc] p-3">
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Entity</dt>
                      <dd className="mt-2 font-semibold">{clientEntityTypeLabels[selectedOrder.client.entityType]}</dd>
                    </div>
                    <div className="border border-[#eee8dc] p-3">
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Urgency</dt>
                      <dd className="mt-2 font-semibold">
                        {urgencyLabel(selectedOrder.supplierUrgency)}
                        {urgencyMarker(selectedOrder.supplierUrgency) ? (
                          <span className="ml-2 font-black text-[#b3261e]">
                            {urgencyMarker(selectedOrder.supplierUrgency)}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div className="border border-[#eee8dc] p-3 sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Vehicle</dt>
                      <dd className="mt-2 font-semibold">{vehicleSummary(selectedOrder)}</dd>
                    </div>
                    <div className="border border-[#eee8dc] p-3">
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">VIN / Chassis</dt>
                      <dd className="mt-2 break-all font-semibold">{selectedOrder.vin || "Not captured"}</dd>
                    </div>
                  </dl>

                  <section className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">Print Pack Documents</h3>
                      <span className="text-xs font-semibold text-[#6b5e4f]">
                        {selectedOrder.documents.length} {selectedOrder.documents.length === 1 ? "file" : "files"}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {selectedOrder.documents.map((document) => {
                        const href = documentHref(document.storageKey);
                        const content = (
                          <>
                            <FileText className="h-5 w-5 text-[#0f766e]" />
                            <span>
                              <span className="block font-semibold">{documentLabel(document.type, document.fileName)}</span>
                              {documentTypeDescriptions[document.type] ? (
                                <span className="mt-1 block text-xs leading-5 text-[#6b5e4f]">
                                  {documentTypeDescriptions[document.type]}
                                </span>
                              ) : null}
                              {href ? <span className="mt-2 block text-xs font-semibold text-[#07315f]">Open document</span> : null}
                            </span>
                          </>
                        );

                        return href ? (
                          <a
                            key={document.id}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="flex gap-3 border border-[#d8d1c3] px-4 py-3 text-left text-sm transition hover:border-[#0f766e]"
                          >
                            {content}
                          </a>
                        ) : (
                          <div key={document.id} className="flex gap-3 border border-[#d8d1c3] px-4 py-3 text-sm">
                            {content}
                          </div>
                        );
                      })}
                      <div className="flex gap-3 border border-[#d8d1c3] px-4 py-3 text-sm">
                        <PackageCheck className="h-5 w-5 text-[#0f766e]" />
                        <span>
                          <span className="block font-semibold">Payment</span>
                          <span className="mt-1 block text-xs leading-5 text-[#6b5e4f]">
                            {selectedOrder.payments.length > 0 ? "Confirmed by License Hub." : "Not confirmed."}
                          </span>
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="mt-6 border-t border-[#d6d0c1] pt-5">
                    <h3 className="font-semibold">Order Comments</h3>
                    <div className="mt-3 space-y-2">
                      {selectedOrder.orderComments.map((comment) => (
                        <div key={comment.id} className="border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#6b5e4f]">
                            <span>{comment.authorName}</span>
                            <span>{comment.createdAt.toLocaleString("en-ZA")}</span>
                          </div>
                          <p className="mt-2 leading-6 text-[#26312d]">{comment.body}</p>
                        </div>
                      ))}
                      {selectedOrder.orderComments.length === 0 ? (
                        <p className="text-sm text-[#52615b]">No order comments yet.</p>
                      ) : null}
                    </div>
                    <form action={addSupplierOrderComment} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <input type="hidden" name="applicationId" value={selectedOrder.id} />
                      <label className="text-sm font-semibold">
                        Supplier feedback
                        <input
                          name="orderComment"
                          placeholder="Add feedback for License Hub"
                          className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                          required
                        />
                      </label>
                      <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
                        Add Feedback
                      </button>
                    </form>
                  </section>

                  <section className="mt-6 border-t border-[#d6d0c1] pt-5">
                    <h3 className="font-semibold">Supplier Actions</h3>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {visibleActions(selectedOrder).map((action) => {
                        const Icon = action.icon;

                        return (
                          <ConfirmActionForm
                            key={action.label}
                            action={action.action}
                            applicationId={selectedOrder.id}
                            message={action.message}
                            className="inline-flex items-center gap-2 border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white"
                          >
                            <Icon className="h-4 w-4" />
                            {action.label}
                          </ConfirmActionForm>
                        );
                      })}
                      {visibleActions(selectedOrder).length === 0 ? (
                        <p className="border border-[#d8b267] bg-[#fff8df] px-4 py-2 text-sm font-semibold text-[#6b5e4f]">
                          Waiting for License Hub to receive this pack back.
                        </p>
                      ) : null}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="p-10 text-sm leading-6 text-[#52615b]">
                No order selected. Once License Hub approves an application to supplier, its print pack appears here.
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

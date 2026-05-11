import Link from "next/link";

import { ConfirmActionForm } from "@/components/confirm-action-form";
import { DatabaseSetup } from "@/components/database-setup";
import { listSupplierApplications, statusLabel } from "@/lib/applications";
import { documentLabel, documentTypeDescriptions } from "@/lib/documents";
import { supplierMarkProduced, supplierMarkReturning } from "@/lib/workflow-actions";
import { supplierStatusActions } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function SupplierPage() {
  const orders = await listSupplierApplications().catch((error: unknown) => {
    console.error(error);
    return null;
  });

  if (!orders) {
    return <DatabaseSetup message="Supplier orders could not be loaded from PostgreSQL." />;
  }

  const selectedOrder = orders[0];

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8">
        <header className="border-b border-[#d8d1c3] pb-6">
          <Link href="/" className="text-sm font-medium text-[#6b5e4f]">
            Back
          </Link>
          <h1 className="mt-4 text-3xl font-semibold">Supplier Portal</h1>
          <p className="mt-2 text-sm text-[#52615b]">
            Approved orders only. Print packs and update production status.
          </p>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            {orders.map((order, index) => (
              <button
                key={order.id}
                className={[
                  "w-full border p-4 text-left",
                  index === 0 ? "border-[#8a6a2a] bg-[#fff8df]" : "border-[#d8d1c3] bg-white",
                ].join(" ")}
              >
                <p className="text-sm font-semibold">{order.id}</p>
                <p className="mt-2">
                  {order.client.firstName} {order.client.surname}
                </p>
                <p className="mt-1 text-sm text-[#52615b]">{order.registrationNumber}</p>
                <p className="mt-1 text-xs text-[#6b5e4f]">{statusLabel(order.currentStatus)}</p>
              </button>
            ))}
          </div>

          <article className="border border-[#d8d1c3] bg-white p-5">
            {selectedOrder ? (
              <>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedOrder.id}</h2>
                    <p className="mt-1 text-sm text-[#52615b]">
                      {selectedOrder.client.firstName} {selectedOrder.client.surname} · {selectedOrder.client.cellphone}
                    </p>
                  </div>
                  <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
                    Print Pack
                  </button>
                </div>

                <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="border border-[#eee8dc] p-3">
                    <dt className="text-[#6b5e4f]">Registration</dt>
                    <dd className="mt-1 font-semibold">{selectedOrder.registrationNumber}</dd>
                  </div>
                  <div className="border border-[#eee8dc] p-3">
                    <dt className="text-[#6b5e4f]">Vehicle</dt>
                    <dd className="mt-1 font-semibold">
                      {selectedOrder.vehicleMake} {selectedOrder.vehicleModel}, {selectedOrder.vehicleYear},{" "}
                      {selectedOrder.vehicleColour}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {selectedOrder.documents.map((document) => (
                    <button key={document.id} className="border border-[#d8d1c3] px-4 py-3 text-left text-sm">
                      <span className="font-medium">{documentLabel(document.type, document.fileName)}</span>
                      {documentTypeDescriptions[document.type] ? (
                        <span className="mt-1 block text-xs leading-5 text-[#6b5e4f]">
                          {documentTypeDescriptions[document.type]}
                        </span>
                      ) : null}
                    </button>
                  ))}
                  <button className="border border-[#d8d1c3] px-4 py-3 text-left text-sm">
                    Payment {selectedOrder.payments.length > 0 ? "Confirmed" : "Not Confirmed"}
                  </button>
                  <button className="border border-[#d8d1c3] px-4 py-3 text-left text-sm">
                    Application Summary
                  </button>
                </div>

                <div className="mt-6 flex flex-wrap gap-3 border-t border-[#d8d1c3] pt-5">
                  {supplierStatusActions.map((action, index) => (
                    <ConfirmActionForm
                      key={action.status}
                      action={index === 0 ? supplierMarkProduced : supplierMarkReturning}
                      applicationId={selectedOrder.id}
                      message={
                        index === 0
                          ? `Confirm that ${selectedOrder.id} has been produced?`
                          : `Confirm that ${selectedOrder.id} is returning to License Hub?`
                      }
                      className={[
                        "border px-4 py-2 text-sm font-semibold",
                        index === 0
                          ? "border-[#8a6a2a] text-[#6b5e4f]"
                          : "border-[#1f2724] bg-[#1f2724] text-white",
                      ].join(" ")}
                    >
                      {action.label}
                    </ConfirmActionForm>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[#52615b]">No supplier-visible orders right now.</p>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

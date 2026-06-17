import { ClientIntakeFlow } from "@/components/client-intake-flow";
import { isPaystackConfigured } from "@/lib/paystack";
import { listActiveServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const services = await listActiveServices().catch((error) => {
    console.error("Failed to load services for /apply:", error);
    return [];
  });
  const paystackEnabled = isPaystackConfigured();

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <section className="border-b border-[#d8d1c3] bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <div className="flex min-h-[360px] flex-col justify-center">
            <div>
              <p className="text-sm font-semibold uppercase text-[#6b5e4f]">License Hub</p>
              <h1 className="mt-8 max-w-2xl text-4xl font-semibold leading-tight text-[#111815] sm:text-5xl">
                Start your vehicle admin application
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#52615b]">
                Choose the product or service you need first. We will then confirm who you are, how the vehicle is
                legally owned, which documents apply, and what needs to be signed or paid.
              </p>
            </div>
          </div>

          <aside className="border border-[#d8d1c3] bg-[#fffdf8] p-4 sm:p-5">
            <h2 className="text-lg font-semibold">What To Expect</h2>
            <div className="mt-5 grid gap-3 text-sm">
              {[
                ["1", "Tell us what you need", "Choose the service and confirm who the vehicle belongs to."],
                ["2", "Confirm the paperwork", "We show only the documents that apply to that ownership scenario."],
                ["3", "Sign and pay", "Upload the files, sign the mandate, then move to payment."],
              ].map(([step, title, text]) => (
                <div key={title} className="border border-[#eee8dc] bg-white p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#c5b89e] bg-[#fff8df] text-xs font-semibold">
                      {step}
                    </span>
                    <div>
                      <p className="font-semibold text-[#1f2724]">{title}</p>
                      <p className="mt-1 leading-5 text-[#52615b]">{text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section id="intake" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <ClientIntakeFlow
          paystackEnabled={paystackEnabled}
          services={services.map((service) => ({
            ...service,
            basePrice: service.basePrice.toString(),
            deliveryFee: service.deliveryFee.toString(),
          }))}
        />
      </section>
    </main>
  );
}

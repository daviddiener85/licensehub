import { ClientIntakeFlow } from "@/components/client-intake-flow";
import { PublicFooter } from "@/components/public-footer";
import { isPaystackConfigured } from "@/lib/paystack";
import { listActiveServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>;
}) {
  const params = await searchParams;
  const selectedServiceSlug = Array.isArray(params.service) ? params.service[0] : params.service;
  const services = await listActiveServices().catch((error) => {
    console.error("Failed to load services for /apply:", error);
    return [];
  });
  const paystackEnabled = isPaystackConfigured();

  return (
    <main className="min-h-screen bg-[#0f1417] text-[#f7f7f2]">
      <section className="tlh-metal-bg relative overflow-hidden border-b border-[#ff9f0a]/30">
        <div className="absolute -right-20 top-0 h-full w-1/2 skew-x-[-18deg] bg-[#111719]/60" />
        <div className="absolute right-0 top-14 h-3 w-1/2 bg-[#ff9f0a]" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <div className="flex min-h-[330px] flex-col justify-center">
            <div>
              <p className="inline-flex border border-[#ff9f0a]/50 bg-[#ff9f0a]/12 px-3 py-2 text-sm font-black uppercase tracking-[0.16em] text-[#ffd08a]">
                The License Hub
              </p>
              <p className="tlh-brand-mark mt-7 text-6xl font-black italic sm:text-8xl">
                T<span className="tlh-l">L</span>H
              </p>
              <h1 className="mt-5 max-w-2xl text-4xl font-black uppercase leading-tight text-white sm:text-5xl">
                Start your vehicle request
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/72">
                Choose the service you need and we&apos;ll guide you through the details, documents, signature and payment
                in one smooth flow.
              </p>
            </div>
          </div>

          <aside className="tlh-dark-panel p-4 sm:p-5">
            <h2 className="text-lg font-black uppercase">What to expect</h2>
            <div className="mt-5 grid gap-3 text-sm">
              {[
                ["1", "Choose your service", "Pick the request you want to submit."],
                ["2", "Complete the details", "We show only the documents that match your situation."],
                ["3", "Sign and pay", "Upload the files, sign the mandate, then continue to payment."],
              ].map(([step, title, text]) => (
                <div key={title} className="border border-white/12 bg-white/8 p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#ff9f0a] bg-[#ff9f0a] text-xs font-black text-[#111719]">
                      {step}
                    </span>
                    <div>
                      <p className="font-black uppercase text-white">{title}</p>
                      <p className="mt-1 leading-5 text-white/68">{text}</p>
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
          initialServiceSlug={selectedServiceSlug}
          paystackEnabled={paystackEnabled}
          services={services.map((service) => ({
            ...service,
            basePrice: service.basePrice.toString(),
            deliveryFee: service.deliveryFee.toString(),
          }))}
        />
      </section>
      <PublicFooter dark />
    </main>
  );
}

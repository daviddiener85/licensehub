import { ClientIntakeFlow } from "@/components/client-intake-flow";
import { isPaystackConfigured } from "@/lib/paystack";
import { listActiveServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function ClientApplicationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const services = await listActiveServices().catch((error) => {
    console.error("Failed to load services for /client/[token]:", error);
    return [];
  });
  const paystackEnabled = isPaystackConfigured();

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <section className="border-b border-[#d8d1c3] bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <div className="flex min-h-[430px] flex-col justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-[#6b5e4f]">License Hub</p>
              <h1 className="mt-8 max-w-2xl text-4xl font-semibold leading-tight text-[#111815] sm:text-5xl">
                Let&apos;s work out what this application needs
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#52615b]">
                You have been sent this secure link because a duplicate vehicle registration certificate may need to be
                requested. Before we ask for uploads or signatures, we need to understand who you are and how the vehicle
                is legally owned.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#intake"
                className="border border-[#1f2724] bg-[#1f2724] px-5 py-3 text-sm font-semibold text-white"
              >
                Proceed
              </a>
              <span className="border border-[#d8d1c3] px-5 py-3 text-sm font-semibold text-[#52615b]">
                Secure client link
              </span>
            </div>
          </div>

          <aside className="border border-[#d8d1c3] bg-[#fffdf8] p-4 sm:p-5">
            <h2 className="text-lg font-semibold">What will happen here</h2>
            <div className="mt-5 grid gap-4 text-sm">
              {[
                "Confirm the person completing the application.",
                "Identify the legal owner of the vehicle.",
                "Confirm your relationship to that owner or entity.",
                "Capture the vehicle details needed for the mandate form.",
                "Show the documents needed for that ownership scenario.",
              ].map((item, index) => (
                <div key={item} className="flex gap-3 border-b border-[#eee8dc] pb-4 last:border-b-0 last:pb-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#c5b89e] bg-white text-xs font-semibold">
                    {index + 1}
                  </span>
                  <p className="pt-1 leading-5 text-[#52615b]">{item}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section id="intake" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <ClientIntakeFlow
          reference={token}
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

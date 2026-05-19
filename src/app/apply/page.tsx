import { ClientIntakeFlow } from "@/components/client-intake-flow";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      slug: true,
      name: true,
      description: true,
      basePrice: true,
    },
  });

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
            <h2 className="text-lg font-semibold">Application Flow</h2>
            <div className="mt-5 grid gap-4 text-sm">
              {[
                "Select the product or service you need.",
                "Explain what the selected application requires.",
                "Identify the client and vehicle ownership scenario.",
                "Capture the vehicle details needed for the mandate form.",
                "Show the required documents for that scenario.",
                "Upload documents, review and sign the mandate form, then request payment.",
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
          services={services.map((service) => ({
            ...service,
            basePrice: service.basePrice.toString(),
          }))}
        />
      </section>
    </main>
  );
}

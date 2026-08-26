import { ClientIntakeFlow } from "@/components/client-intake-flow";
import { PublicFooter } from "@/components/public-footer";
import { isPaystackConfigured } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";
import { listActiveServices } from "@/lib/services";
import Link from "next/link";

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
  const retentionSetting = await prisma.retentionSetting.findUnique({
    where: { id: "default" },
    select: {
      deliveryOptionEnabled: true,
      eftBankName: true,
      eftAccountHolder: true,
      eftAccountNumber: true,
      eftBranchCode: true,
      eftAccountType: true,
      eftReferenceInstruction: true,
    },
  });
  const deliveryOptionEnabled = retentionSetting?.deliveryOptionEnabled ?? true;

  return (
    <main className="min-h-screen bg-[#0f1417] text-[#f7f7f2]">
      <section className="tlh-metal-bg relative overflow-hidden border-b border-[#ff9f0a]/30">
        <div className="absolute -right-20 top-0 h-full w-1/2 skew-x-[-18deg] bg-[#111719]/60" />
        <div className="absolute right-0 top-14 h-3 w-1/2 bg-[#ff9f0a]" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[1fr_0.9fr] lg:px-8">
          <div className="flex min-h-[330px] flex-col justify-center">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="inline-flex border border-[#ff9f0a]/50 bg-[#ff9f0a]/12 px-3 py-2 text-sm font-black uppercase tracking-[0.16em] text-[#ffd08a]">
                  The License Hub
                </p>
                <Link href="/help" className="text-sm font-semibold text-white/72 underline decoration-white/30 underline-offset-4">
                  Need help?
                </Link>
              </div>
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
        </div>
      </section>

      <section id="intake" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <ClientIntakeFlow
          initialServiceSlug={selectedServiceSlug}
          paystackEnabled={paystackEnabled}
          deliveryOptionEnabled={deliveryOptionEnabled}
          eftBankingDetails={{
            bankName: retentionSetting?.eftBankName ?? null,
            accountHolder: retentionSetting?.eftAccountHolder ?? null,
            accountNumber: retentionSetting?.eftAccountNumber ?? null,
            branchCode: retentionSetting?.eftBranchCode ?? null,
            accountType: retentionSetting?.eftAccountType ?? null,
            referenceInstruction: retentionSetting?.eftReferenceInstruction ?? null,
          }}
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

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  intro: string;
  updatedOn: string;
  children: React.ReactNode;
};

export function LegalPageShell({ eyebrow, title, intro, updatedOn, children }: LegalPageShellProps) {
  return (
    <main className="min-h-screen bg-[#0f1417] text-white">
      <section className="tlh-metal-bg relative overflow-hidden border-b border-white/10">
        <div className="absolute -left-24 top-16 h-64 w-64 rounded-full bg-white/8 blur-3xl" />
        <div className="absolute right-0 top-0 h-full w-[28%] bg-[#111719]/60" />
        <div className="relative mx-auto flex max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="tlh-nav-mark flex h-11 w-16 items-center justify-center border border-white/25 bg-white/10 text-2xl font-black italic">
                T<span className="text-[#ff9f0a]">L</span>H
              </span>
              <span className="text-sm font-black uppercase tracking-[0.18em]">The License Hub</span>
            </Link>

            <Link href="/apply" className="hidden text-sm font-semibold text-white/72 underline decoration-white/28 sm:inline">
              Start application
            </Link>
          </div>

          <div className="grid gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 border border-[#ff9f0a]/55 bg-[#ff9f0a]/12 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#ffd08a]">
                <ShieldCheck className="h-4 w-4" />
                {eyebrow}
              </div>
              <h1 className="mt-6 text-4xl font-black uppercase leading-[1.02] sm:text-5xl lg:text-6xl">{title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/76">{intro}</p>
              <p className="mt-4 text-sm font-semibold uppercase tracking-[0.12em] text-white/50">
                Last updated {updatedOn}
              </p>
            </div>

            <aside className="tlh-dark-panel p-5 sm:p-6">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#ffb84d]">Read this first</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-white/80">
                <li>These pages are a draft policy draft for review before publication.</li>
                <li>They are written to match the current The License Hub tone and flow.</li>
                <li>Use them as the customer-facing legal pages linked from the site footer.</li>
              </ul>
              <Link
                href="/"
                className="mt-6 inline-flex items-center gap-2 border border-white/20 px-4 py-2 text-sm font-semibold text-white/92"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to home
              </Link>
            </aside>
          </div>
        </div>
      </section>

      <section className="bg-[#f7f3ea] px-5 py-10 text-[#182024] sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="tlh-panel p-5 sm:p-8">{children}</div>
        </div>
      </section>
    </main>
  );
}

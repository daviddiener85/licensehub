import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0f1417] text-[#f7f7f2]">
      <section className="tlh-metal-bg relative min-h-screen overflow-hidden text-white">
        <Image
          src="/landing/license-hub-hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-48 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(8,11,13,0.98)_0%,rgba(22,29,33,0.9)_48%,rgba(12,16,18,0.48)_100%)]" />
        <div className="absolute -left-24 top-24 h-72 w-72 rotate-45 border-t-4 border-[#ff9f0a]/80" />

        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <nav className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="tlh-nav-mark flex h-11 w-16 items-center justify-center border border-white/25 bg-white/10 text-2xl font-black italic">
                T<span className="text-[#ff9f0a]">L</span>H
              </span>
              <span className="text-sm font-black uppercase tracking-[0.18em]">The License Hub</span>
            </Link>
            <Link
              href="/help"
              className="hidden border border-white/35 px-4 py-2 text-sm font-semibold text-white/90 sm:inline-block"
            >
              Help
            </Link>
          </nav>

          <div className="flex flex-1 items-center">
            <div className="max-w-3xl py-14">
              <div className="inline-flex items-center gap-2 border border-[#ff9f0a]/60 bg-[#ff9f0a]/12 px-3 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#ffd08a] backdrop-blur">
                <Sparkles className="h-4 w-4" />
                Guided vehicle services
              </div>
              <div className="mt-8">
                <p className="tlh-brand-mark text-7xl font-black italic sm:text-9xl lg:text-[10.5rem]">
                  T<span className="tlh-l">L</span>H
                </p>
                <div className="tlh-orange-rule mt-4 h-1 max-w-xl" />
              </div>
              <h1 className="mt-7 max-w-3xl text-4xl font-black uppercase leading-[1.02] tracking-wide sm:text-5xl lg:text-6xl">
                Vehicle paperwork, handled online.
              </h1>
              <p className="mt-4 max-w-2xl text-xl font-black uppercase leading-7 text-white">
                Simple, guided vehicle documentation assistance.
              </p>
              <p className="mt-6 max-w-xl text-base leading-8 text-white/76">
                Start online, upload what we need, sign on your phone, and let our team handle the rest.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/apply?service=duplicate-certificate"
                  className="tlh-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-wide"
                >
                  Start here
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/help" className="border border-white/45 px-5 py-3 text-sm font-semibold text-white">
                  Help / what to expect
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

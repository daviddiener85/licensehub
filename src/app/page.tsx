import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  CarFront,
  ClipboardCheck,
  FileCheck2,
  FileText,
  IdCard,
  PenLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { PublicFooter } from "@/components/public-footer";

const services = [
  {
    title: "Duplicate Certificate",
    description: "Recover a lost or missing registration certificate with a guided online submission.",
    href: "/apply?service=duplicate-certificate",
    available: "Available now",
  },
  {
    title: "Change of Ownership",
    description: "Handle the transfer paperwork with a streamlined guided flow for Gauteng vehicle transfers.",
    href: "/apply?service=change-of-ownership",
    available: "Gauteng only",
  },
  {
    title: "Licence Renewal",
    description: "Renew a licence with the documents and payment steps clearly laid out.",
    href: "/apply?service=licence-renewal",
    available: "Gauteng only",
  },
];

const processSteps = [
  { icon: FileText, label: "Choose your service", text: "Select the vehicle document service you need." },
  { icon: IdCard, label: "Share the details", text: "Tell us who the vehicle belongs to and share the key details." },
  { icon: PenLine, label: "Sign and continue", text: "Review the populated mandate form and sign on your phone." },
  { icon: ClipboardCheck, label: "Upload and submit", text: "Add the required documents so we can review your request." },
];

const documents = [
  "ID, passport or traffic register document",
  "Vehicle licence disk photo",
  "Proof of address dated within the last 3 months",
  "Extra ownership documents when the vehicle is owned by an estate, company or trust",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0f1417] text-[#f7f7f2]">
      <section className="tlh-metal-bg relative min-h-[92svh] overflow-hidden text-white">
        <Image
          src="/landing/license-hub-hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-48 mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(8,11,13,0.98)_0%,rgba(22,29,33,0.88)_42%,rgba(12,16,18,0.42)_100%)]" />
        <div className="absolute -left-24 top-24 h-72 w-72 rotate-45 border-t-4 border-[#ff9f0a]/80" />
        <div className="absolute right-0 top-0 hidden h-full w-[35%] border-l border-white/10 bg-[#111719]/60 shadow-2xl lg:block">
          <div className="absolute left-0 top-28 h-3 w-full bg-[#ff9f0a]" />
          <div className="absolute left-12 top-40 text-sm font-black uppercase tracking-[0.18em] text-white/80">
            The <span className="text-[#ff9f0a]">License</span> Hub
          </div>
        </div>

        <div className="relative mx-auto flex min-h-[92svh] max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <nav className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="tlh-nav-mark flex h-11 w-16 items-center justify-center border border-white/25 bg-white/10 text-2xl font-black italic">
                T<span className="text-[#ff9f0a]">L</span>H
              </span>
              <span className="text-sm font-black uppercase tracking-[0.18em]">The License Hub</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/apply?service=duplicate-certificate"
                className="tlh-button-primary px-4 py-2 text-sm font-black uppercase tracking-wide"
              >
                Start
              </Link>
              <Link
                href="/admin"
                className="hidden border border-white/35 px-4 py-2 text-sm font-semibold text-white/90 sm:inline-block"
              >
                Staff
              </Link>
            </div>
          </nav>

          <div className="flex flex-1 items-center">
            <div className="max-w-3xl py-14">
              <div className="inline-flex items-center gap-2 border border-[#ff9f0a]/60 bg-[#ff9f0a]/12 px-3 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#ffd08a] backdrop-blur">
                <Sparkles className="h-4 w-4" />
                Vehicle document services
              </div>
              <div className="mt-8">
                <p className="tlh-brand-mark text-7xl font-black italic sm:text-9xl lg:text-[10.5rem]">
                  T<span className="tlh-l">L</span>H
                </p>
                <div className="tlh-orange-rule mt-4 h-1 max-w-xl" />
              </div>
              <h1 className="mt-7 max-w-3xl text-4xl font-black uppercase leading-[1.02] tracking-wide sm:text-5xl lg:text-6xl">
                The License Hub
              </h1>
              <p className="mt-4 max-w-xl text-xl font-black uppercase leading-7 text-white">
                Simple, guided vehicle document help.
              </p>
              <p className="mt-6 max-w-xl text-base leading-8 text-white/76">
                Start online, upload the documents we need, sign on your phone, and let the team handle the rest.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/apply?service=duplicate-certificate"
                  className="tlh-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-wide"
                >
                  Start an application
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#services"
                  className="border border-white/45 px-5 py-3 text-sm font-semibold text-white"
                >
                  See how it works
                </a>
              </div>
            </div>
          </div>

          <div className="grid gap-3 pb-4 sm:grid-cols-3">
            {[
              ["Guided application", "Follow a simple step-by-step flow."],
              ["Document guidance", "See exactly what to upload before you start."],
              ["Team review", "We check the submission and keep things moving."],
            ].map(([title, text]) => (
              <div key={title} className="border border-white/14 bg-[#111719]/70 p-4 backdrop-blur">
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-6 text-white/72">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="border-b border-[#3a4349] bg-[#12181c]">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:px-10">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#ff9f0a]">How License Hub helps</p>
            <h2 className="mt-3 text-3xl font-black uppercase">Choose the request you need and we&apos;ll guide the rest.</h2>
            <p className="mt-4 leading-7 text-white/68">
              The application flow captures your service, ownership details, vehicle information, required documents and
              signed mandate so you can submit everything in one place.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {services.map((service) => (
              <Link
                key={service.title}
                href={service.href}
                className="group border border-white/12 bg-[#1b2328] p-5 transition hover:-translate-y-1 hover:border-[#ff9f0a] hover:bg-[#202a30]"
              >
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[#ffb84d]">{service.available}</span>
                <h3 className="mt-4 text-xl font-black uppercase text-white">{service.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/64">{service.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-black uppercase text-[#ff9f0a]">
                  Apply
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="tlh-metal-bg text-[#111719]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
          <div className="tlh-panel p-6">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-[#e87900]">How it works</p>
            <h2 className="mt-3 text-3xl font-black uppercase">A few clear steps to get your application moving.</h2>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {processSteps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <div key={step.label} className="border border-[#d8d1c3] bg-white p-5">
                    <div className="flex items-center justify-between">
                      <Icon className="h-6 w-6 text-[#e87900]" />
                      <span className="text-xs font-black text-[#e87900]">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <h3 className="mt-5 font-black uppercase">{step.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#53615c]">{step.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="tlh-dark-panel p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-7 w-7 text-[#ff9f0a]" />
              <h2 className="text-2xl font-black uppercase">What to prepare</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {documents.map((document) => (
                <div key={document} className="flex gap-3 border-b border-white/14 pb-4 last:border-b-0 last:pb-0">
                  <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#ff9f0a]" />
                  <p className="text-sm leading-6 text-white/82">{document}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="border-t border-[#303940] bg-[#f7f3ea] text-[#182024]">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 md:grid-cols-3 lg:px-10">
          <div className="flex gap-4">
            <CarFront className="h-7 w-7 shrink-0 text-[#e87900]" />
            <div>
              <h3 className="font-semibold">Vehicle details captured once</h3>
              <p className="mt-2 text-sm leading-6 text-[#53615c]">
                Registration, VIN or chassis, make and model flow into the mandate form automatically.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Smartphone className="h-7 w-7 shrink-0 text-[#e87900]" />
            <div>
              <h3 className="font-semibold">Built for phone submission</h3>
              <p className="mt-2 text-sm leading-6 text-[#53615c]">
                Upload document photos, review the form and sign without printing first.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <BadgeCheck className="h-7 w-7 shrink-0 text-[#e87900]" />
            <div>
              <h3 className="font-semibold">Ready for our team</h3>
              <p className="mt-2 text-sm leading-6 text-[#53615c]">
                Submitted applications are saved for review, payment confirmation and processing.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#111719] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div>
            <h2 className="text-3xl font-semibold">Ready to start?</h2>
            <p className="mt-2 text-sm leading-6 text-white/72">
              Choose your service, confirm the details and send the documents we need to get started.
            </p>
          </div>
          <Link
            href="/apply"
            className="tlh-button-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-wide"
          >
            Start application
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      <PublicFooter dark />
    </main>
  );
}

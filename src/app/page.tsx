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
  MapPin,
  PenLine,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

const services = [
  {
    title: "Duplicate Certificate",
    description: "Replace a lost or missing vehicle registration certificate with guided document capture.",
    href: "/apply",
    available: "Available now",
  },
  {
    title: "Change of Ownership",
    description: "Prepare the ownership-transfer documents and mandate details for Gauteng vehicle transfers.",
    href: "/apply",
    available: "Gauteng only",
  },
  {
    title: "Licence Renewal",
    description: "Start a guided renewal request with vehicle details, address confirmation and payment follow-up.",
    href: "/apply",
    available: "Gauteng only",
  },
];

const processSteps = [
  { icon: FileText, label: "Choose your service", text: "Select the vehicle document service you need." },
  { icon: IdCard, label: "Confirm your details", text: "Capture client, ownership and vehicle information." },
  { icon: PenLine, label: "Sign digitally", text: "Review the populated mandate form and sign on your phone." },
  { icon: ClipboardCheck, label: "Submit for review", text: "Upload documents so License Hub can process the request." },
];

const documents = [
  "ID, passport or traffic register document",
  "Vehicle licence disk photo",
  "Proof of address dated within the last 3 months",
  "Extra ownership documents when the vehicle is owned by an estate, company or trust",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f4f1e8] text-[#17211e]">
      <section className="relative min-h-[88svh] overflow-hidden bg-[#10251f] text-white">
        <Image
          src="/landing/license-hub-hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,24,20,0.92)_0%,rgba(10,24,20,0.76)_38%,rgba(10,24,20,0.24)_72%,rgba(10,24,20,0.1)_100%)]" />

        <div className="relative mx-auto flex min-h-[88svh] max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-10">
          <nav className="flex items-center justify-between gap-4">
            <Link href="/" className="text-xl font-semibold">
              License Hub
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/apply"
                className="border border-white bg-white px-4 py-2 text-sm font-semibold text-[#10251f]"
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
            <div className="max-w-2xl py-14">
              <div className="inline-flex items-center gap-2 border border-white/35 bg-white/10 px-3 py-2 text-sm font-semibold backdrop-blur">
                <MapPin className="h-4 w-4" />
                Vehicle document services in South Africa
              </div>
              <h1 className="mt-6 text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
                Vehicle paperwork, handled without the runaround.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/86">
                License Hub helps you start duplicate certificate, ownership and licence admin requests online, with the
                right documents collected before the team reviews your application.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/apply"
                  className="inline-flex items-center gap-2 border border-[#f5c45f] bg-[#f5c45f] px-5 py-3 text-sm font-semibold text-[#17211e]"
                >
                  Start an application
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#services"
                  className="border border-white/45 px-5 py-3 text-sm font-semibold text-white"
                >
                  View services
                </a>
              </div>
            </div>
          </div>

          <div className="grid gap-3 pb-4 sm:grid-cols-3">
            {[
              ["Digital mandate", "Review and sign from your phone."],
              ["Document guidance", "Know what to upload before submitting."],
              ["Admin review", "Your request lands in the License Hub workspace."],
            ].map(([title, text]) => (
              <div key={title} className="border border-white/18 bg-[#10251f]/55 p-4 backdrop-blur">
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-6 text-white/72">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="services" className="border-b border-[#d6d0c1] bg-[#fffdf8]">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase text-[#0f766e]">What License Hub Does</p>
            <h2 className="mt-3 text-3xl font-semibold">Start the right vehicle admin request.</h2>
            <p className="mt-4 leading-7 text-[#53615c]">
              The application flow captures your service, ownership scenario, vehicle details, required documents and
              signed mandate so the team can review a complete submission.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {services.map((service) => (
              <Link
                key={service.title}
                href={service.href}
                className="border border-[#d6d0c1] bg-white p-5 transition hover:border-[#0f766e]"
              >
                <span className="text-xs font-semibold uppercase text-[#9a6a1f]">{service.available}</span>
                <h3 className="mt-4 text-xl font-semibold">{service.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#53615c]">{service.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#0f5f58]">
                  Apply
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f4f1e8]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase text-[#0f766e]">How It Flows</p>
            <h2 className="mt-3 text-3xl font-semibold">From landing page to application in a few clear steps.</h2>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {processSteps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <div key={step.label} className="border border-[#d6d0c1] bg-white p-5">
                    <div className="flex items-center justify-between">
                      <Icon className="h-6 w-6 text-[#0f766e]" />
                      <span className="text-xs font-semibold text-[#9a6a1f]">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <h3 className="mt-5 font-semibold">{step.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#53615c]">{step.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="border border-[#16352d] bg-[#16352d] p-6 text-white">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-7 w-7 text-[#f5c45f]" />
              <h2 className="text-2xl font-semibold">What to have ready</h2>
            </div>
            <div className="mt-6 grid gap-4">
              {documents.map((document) => (
                <div key={document} className="flex gap-3 border-b border-white/14 pb-4 last:border-b-0 last:pb-0">
                  <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#f5c45f]" />
                  <p className="text-sm leading-6 text-white/82">{document}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="border-t border-[#d6d0c1] bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-12 sm:px-8 md:grid-cols-3 lg:px-10">
          <div className="flex gap-4">
            <CarFront className="h-7 w-7 shrink-0 text-[#0f766e]" />
            <div>
              <h3 className="font-semibold">Vehicle details captured once</h3>
              <p className="mt-2 text-sm leading-6 text-[#53615c]">
                Registration, VIN or chassis, make and model flow into the mandate form.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Smartphone className="h-7 w-7 shrink-0 text-[#0f766e]" />
            <div>
              <h3 className="font-semibold">Built for phone submission</h3>
              <p className="mt-2 text-sm leading-6 text-[#53615c]">
                Upload document photos, review the form and sign without printing first.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <BadgeCheck className="h-7 w-7 shrink-0 text-[#0f766e]" />
            <div>
              <h3 className="font-semibold">Ready for admin follow-up</h3>
              <p className="mt-2 text-sm leading-6 text-[#53615c]">
                Submitted applications are saved for review, payment confirmation and processing.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#10251f] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div>
            <h2 className="text-3xl font-semibold">Ready to start?</h2>
            <p className="mt-2 text-sm leading-6 text-white/72">
              Choose your service, confirm the details and submit the documents License Hub needs.
            </p>
          </div>
          <Link
            href="/apply"
            className="inline-flex items-center justify-center gap-2 border border-[#f5c45f] bg-[#f5c45f] px-5 py-3 text-sm font-semibold text-[#17211e]"
          >
            Start application
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

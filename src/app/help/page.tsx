import Link from "next/link";
import { FileText, IdCard, PenLine, ClipboardCheck, ShieldCheck, FileCheck2, ArrowRight } from "lucide-react";

const processSteps = [
  { icon: FileText, label: "Choose your service", text: "Select the vehicle document service you need." },
  { icon: IdCard, label: "Share the details", text: "Tell us who the vehicle belongs to and share the key details." },
  { icon: PenLine, label: "Sign and continue", text: "Review the populated mandate form and sign on your phone." },
  { icon: ClipboardCheck, label: "Upload and submit", text: "Add the required documents so we can review your request." },
];

const documents = [
  "Registration document (Original RC1)",
  "License disc pic (must be valid)",
  "Current owner ID",
  "Current owner proof of address",
  "New owner ID",
  "New owner proof of address, not older than three months",
  "Mandate form is populated by us",
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#0f1417] text-[#f7f7f2]">
      <section className="border-b border-[#3a4349] bg-[#12181c]">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-10">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-[#ff9f0a]">Help</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black uppercase leading-tight sm:text-5xl">
            What to expect before you start.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">
            This page explains the process, the documents you may need, and the basic steps before you launch an
            application.
          </p>
          <div className="mt-8">
            <Link
              href="/apply?service=change-of-ownership"
              className="tlh-button-primary inline-flex items-center gap-2 px-5 py-3 text-sm font-black uppercase tracking-wide"
            >
              Start an application
              <ArrowRight className="h-4 w-4" />
            </Link>
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
            <p className="mt-5 border border-white/14 bg-white/5 p-3 text-xs leading-5 text-white/70">
              For licence fee renewal, if any other vehicle licence discs are outstanding, this licence disc will not
              print and only an MVLX will be supplied. The licence fee will still be paid up to date.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";

import { applicationPipeline, buildModules } from "@/lib/workflow";

const testLinks = [
  { href: "/client/demo-resubmit", label: "Client Link" },
  { href: "/admin", label: "Admin Workspace" },
  { href: "/supplier", label: "Supplier Portal" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <section className="border-b border-[#d8d1c3] bg-[#fffdf8]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6b5e4f]">
                License Hub
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight text-[#111815] sm:text-5xl">
                Workflow platform foundation
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#4b5651]">
                The project is scaffolded for the client application link, admin review
                workspace, restricted supplier portal, payments, documents, and retention
                audit trail defined in the v1.2 working specification.
              </p>
            </div>
            <div className="grid min-w-48 grid-cols-2 gap-3 text-sm">
              <div className="border border-[#d8d1c3] bg-[#f7f5ef] p-4">
                <p className="text-[#6b5e4f]">Launch service</p>
                <p className="mt-2 font-semibold">Duplicate Certificate</p>
              </div>
              <div className="border border-[#d8d1c3] bg-[#f7f5ef] p-4">
                <p className="text-[#6b5e4f]">Retention</p>
                <p className="mt-2 font-semibold">Admin configurable</p>
              </div>
            </div>
          </div>

          <nav className="flex flex-wrap gap-3">
            {testLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#33423d]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {applicationPipeline.map((stage, index) => (
              <div
                key={stage.key}
                className="border border-[#d8d1c3] bg-white p-4"
              >
                <p className="text-xs font-semibold text-[#8a6a2a]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-3 text-sm font-semibold">{stage.label}</p>
                <p className="mt-1 text-xs text-[#68736e]">{stage.owner}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-8 sm:px-8 md:grid-cols-2 lg:px-10">
        {buildModules.map((module) => (
          <article key={module.title} className="border border-[#d8d1c3] bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">{module.title}</h2>
              <span className="shrink-0 border border-[#c5b89e] px-2 py-1 text-xs font-medium text-[#6b5e4f]">
                {module.status}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#4b5651]">{module.description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

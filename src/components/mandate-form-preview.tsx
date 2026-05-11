import {
  AlertTriangle,
  Camera,
  Car,
  CheckCircle2,
  FileText,
  Hash,
  IdCard,
  Laptop,
  Palette,
  PenLine,
} from "lucide-react";

type MandateFormPreviewProps = {
  clientName: string;
  clientIdLabel: string;
  registrationNumber: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  date: Date;
};

const detailRows = [
  { label: "Vehicle Registration Number", key: "registrationNumber", icon: FileText },
  { label: "VIN Number", key: "vin", icon: Hash },
  { label: "Make", key: "make", icon: Car },
  { label: "Model", key: "model", icon: Laptop },
  { label: "Color", key: "colour", icon: Palette },
] as const;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function fieldValue(value: string | null) {
  return value?.trim() || "To be confirmed";
}

export function MandateFormPreview({
  clientName,
  clientIdLabel,
  registrationNumber,
  vin,
  make,
  model,
  colour,
  date,
}: MandateFormPreviewProps) {
  const values = {
    registrationNumber,
    vin,
    make,
    model,
    colour,
  };

  return (
    <section className="border border-[#0b3564] bg-white text-[#111827] shadow-sm">
      <header className="bg-[#07315f] px-5 py-5 text-center text-white">
        <h3 className="text-balance text-xl font-black uppercase leading-tight sm:text-2xl">
          Request Letter For Duplicate Vehicle Registration Document
        </h3>
      </header>

      <div className="space-y-5 px-5 py-6">
        <div className="grid gap-4 text-sm sm:grid-cols-[1fr_auto]">
          <div>
            <p className="font-bold">To,</p>
            <p className="font-bold">To Whom This May Concern</p>
          </div>
          <p className="font-bold">
            Date: <span className="inline-block min-w-32 border-b border-[#111827] px-2 font-medium">{formatDate(date)}</span>
          </p>
        </div>

        <p className="text-sm leading-6">
          I, Mr./Mrs./Ms.{" "}
          <span className="inline-block min-w-48 border-b border-[#111827] px-2 font-semibold">{clientName}</span>, ID:{" "}
          <span className="inline-block min-w-44 border-b border-[#111827] px-2 font-semibold">{clientIdLabel}</span>,
        </p>
        <p className="max-w-3xl text-sm leading-6">
          Hereby wish to state that I have lost my vehicle&apos;s registration document and wish to make use of the
          license hub&apos;s assistance in obtaining a duplicate on my behalf.
        </p>

        <div>
          <div className="mb-3 flex items-center gap-3 text-[#07315f]">
            <span className="flex size-9 items-center justify-center rounded-full border-2 border-[#07315f]">
              <Car size={20} aria-hidden="true" />
            </span>
            <h4 className="text-lg font-black uppercase">Vehicle Details</h4>
          </div>

          <dl className="space-y-3">
            {detailRows.map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.key} className="grid gap-2 text-sm sm:grid-cols-[2rem_15rem_1fr] sm:items-end">
                  <span className="hidden size-8 items-center justify-center rounded-full border border-[#07315f] text-[#07315f] sm:flex">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <dt className="font-semibold">{row.label}:</dt>
                  <dd className="border-b border-dotted border-[#111827] px-2 pb-1 font-medium">
                    {fieldValue(values[row.key])}
                  </dd>
                </div>
              );
            })}

            <div className="grid gap-2 text-sm sm:grid-cols-[2rem_7rem_1fr] sm:items-end">
              <span className="hidden size-8 items-center justify-center rounded-full border border-[#07315f] text-[#07315f] sm:flex">
                <PenLine size={17} aria-hidden="true" />
              </span>
              <dt className="font-bold">Signature:</dt>
              <dd className="min-h-8 border-b border-[#111827]" />
            </div>
          </dl>
        </div>

        <div className="border-t-2 border-[#07315f] pt-4">
          <div className="rounded border-2 border-[#07315f] bg-[#eef7ff] p-4 text-center">
            <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 bg-[#07315f] px-4 py-2 text-white">
              <AlertTriangle size={20} aria-hidden="true" />
              <h4 className="text-lg font-black uppercase">Important: Identity Verification</h4>
              <AlertTriangle size={20} aria-hidden="true" />
            </div>
            <p className="mt-4 text-lg font-black uppercase leading-tight text-[#07315f]">
              Place <span className="text-[#d71920]">actual ID</span> in the space below and take a picture of the{" "}
              <span className="text-[#d71920]">entire page</span>
            </p>

            <div className="mx-auto mt-4 grid max-w-3xl gap-4 rounded border-2 border-dashed border-[#07315f] bg-white p-4 sm:grid-cols-[1fr_1fr] sm:items-center">
              <div className="rounded border border-[#b8cce0] bg-[#f8fbff] p-3 text-left shadow-sm">
                <div className="bg-[#0b5ea8] px-3 py-1 text-center text-xs font-bold uppercase text-white">
                  Identification Card
                </div>
                <div className="mt-3 grid grid-cols-[4rem_1fr] gap-3 text-xs">
                  <div className="flex aspect-[3/4] items-center justify-center bg-[#d9dee7]">
                    <IdCard size={28} className="text-[#52615b]" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold">ID NUMBER</p>
                    <p>{clientIdLabel}</p>
                    <p className="font-bold">NAME</p>
                    <p>{clientName}</p>
                  </div>
                </div>
              </div>
              <p className="text-xl font-black uppercase leading-tight text-[#07315f]">
                Place your <span className="text-[#d71920]">actual ID here</span>
              </p>
            </div>

            <div className="mx-auto mt-4 grid max-w-3xl gap-3 text-left sm:grid-cols-[5rem_1fr_auto] sm:items-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-[#07315f] text-white">
                <Camera size={32} aria-hidden="true" />
              </span>
              <p className="text-lg font-black uppercase leading-tight text-[#07315f]">
                Take a clear picture of the <span className="text-[#d71920]">entire page</span>
              </p>
              <FileText size={44} className="text-[#07315f]" aria-hidden="true" />
            </div>
            <p className="mt-2 text-sm text-[#26312d]">Make sure all details are visible and readable.</p>
          </div>
        </div>
      </div>

      <footer className="flex flex-col gap-2 bg-[#07315f] px-5 py-3 text-sm font-bold uppercase text-white sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <CheckCircle2 size={20} aria-hidden="true" />
          Incomplete submissions may cause delays.
        </span>
        <span>Thank you</span>
      </footer>
    </section>
  );
}

"use client";

import type { FormEvent } from "react";
import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  IdCard,
  LoaderCircle,
  PenLine,
  Scale,
  Upload,
  UserRound,
} from "lucide-react";

import { createPublicApplicationIntake, scanLicenceDiskPhoto } from "@/lib/workflow-actions";

type OwnershipType = "private-owner" | "deceased-estate" | "company-or-trust" | "non-sa-citizen";

type IntakeService = {
  slug: string;
  name: string;
  description: string;
  basePrice: string;
};

type ClientIntakeFlowProps = {
  reference?: string;
  services?: IntakeService[];
};

type Point = {
  x: number;
  y: number;
};

const fallbackServices: IntakeService[] = [
  {
    slug: "duplicate-certificate",
    name: "Duplicate Certificate",
    description: "Replacement of lost vehicle certificates.",
    basePrice: "0",
  },
  {
    slug: "change-of-ownership",
    name: "Change of Ownership",
    description: "Vehicle ownership transfer assistance. Available in Gauteng only.",
    basePrice: "0",
  },
  {
    slug: "licence-renewal",
    name: "Licence Renewal",
    description: "Vehicle licence renewal assistance. Available in Gauteng only.",
    basePrice: "0",
  },
];

const gautengOnlyServiceSlugs = new Set(["change-of-ownership", "licence-renewal"]);

const initialLicenceDiskScanState = {
  status: "idle",
  message: "Choose a clear licence disk photo, then enter the vehicle details from the disk.",
  fields: {
    registrationNumber: "",
    vin: "",
    make: "",
    model: "",
  },
  confidence: 0,
};

const ownershipOptions: {
  value: OwnershipType;
  label: string;
  relationPrompt: string;
  description: string;
  icon: typeof UserRound;
}[] = [
  {
    value: "private-owner",
    label: "Private owner",
    relationPrompt: "I am the registered owner or I am assisting the registered owner.",
    description: "The vehicle is registered to an individual South African owner.",
    icon: UserRound,
  },
  {
    value: "deceased-estate",
    label: "Deceased estate",
    relationPrompt: "I am the executor, estate representative, or assisting the estate.",
    description: "The registered owner has passed away and the request is handled through the estate.",
    icon: Scale,
  },
  {
    value: "company-or-trust",
    label: "Company or trust",
    relationPrompt: "I am authorised to act for the company, close corporation, or trust.",
    description: "The vehicle is registered to a legal entity rather than a natural person.",
    icon: Building2,
  },
  {
    value: "non-sa-citizen",
    label: "Non-SA citizen",
    relationPrompt: "I am the owner or authorised representative using foreign identity documents.",
    description: "The owner is not using a South African ID number for this application.",
    icon: IdCard,
  },
];

const documentsByOwnership: Record<OwnershipType, { label: string; description: string }[]> = {
  "private-owner": [
    { label: "Owner ID photo", description: "A clear photo of the South African ID document or card." },
    { label: "Licence disk photo", description: "A clear photo showing the vehicle registration details." },
    { label: "Proof of address", description: "A document dated within the last 3 months." },
  ],
  "deceased-estate": [
    { label: "Executor or representative ID", description: "A clear photo of the person handling the estate request." },
    { label: "Death certificate", description: "Proof that the registered owner is deceased." },
    { label: "Executor authority document", description: "Letter of executorship or authority to act for the estate." },
    { label: "Licence disk photo", description: "A clear photo showing the vehicle registration details." },
    { label: "Proof of address", description: "A document dated within the last 3 months." },
  ],
  "company-or-trust": [
    { label: "Representative ID photo", description: "A clear photo of the authorised signer." },
    { label: "Company or trust registration document", description: "CIPC document, trust deed, or equivalent entity document." },
    { label: "Authority to act", description: "Resolution, letter, or proof that the signer may act for the entity." },
    { label: "Licence disk photo", description: "A clear photo showing the vehicle registration details." },
    { label: "Proof of address", description: "A document dated within the last 3 months." },
  ],
  "non-sa-citizen": [
    { label: "Passport or traffic register document", description: "A clear identity document for the owner." },
    { label: "Licence disk photo", description: "A clear photo showing the vehicle registration details." },
    { label: "Proof of address", description: "A document dated within the last 3 months." },
  ],
};

const steps = [
  "Service",
  "Start",
  "Who You Are",
  "Vehicle Relationship",
  "Vehicle Details",
  "Documents",
  "Mandate Form",
  "Payment",
] as const;

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function SubmitApplicationButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        "mt-5 w-full border px-4 py-3 text-sm font-semibold",
        pending
          ? "cursor-wait border-[#e4ded2] bg-[#e8e2d6] text-[#6b5e4f]"
          : "border-[#1f2724] bg-[#1f2724] text-white",
      ].join(" ")}
    >
      {pending ? "Saving application..." : "Request Payment"}
    </button>
  );
}

function uploadInputName(documentLabel: string) {
  const normalizedLabel = documentLabel.toLowerCase();

  if (normalizedLabel.includes("id") || normalizedLabel.includes("passport") || normalizedLabel.includes("traffic register")) {
    return "idPhoto";
  }

  if (normalizedLabel.includes("licence disk")) {
    return "licenceDiskPhoto";
  }

  if (normalizedLabel.includes("proof of address")) {
    return "proofOfAddress";
  }

  return "supportingDocument";
}

export function ClientIntakeFlow({ reference, services = fallbackServices }: ClientIntakeFlowProps) {
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const availableServices = [...(services.length > 0 ? services : fallbackServices)].sort((first, second) => {
    if (first.slug === "duplicate-certificate") {
      return -1;
    }

    if (second.slug === "duplicate-certificate") {
      return 1;
    }

    return first.name.localeCompare(second.name);
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedServiceSlug, setSelectedServiceSlug] = useState(
    availableServices.some((service) => service.slug === "duplicate-certificate")
      ? "duplicate-certificate"
      : availableServices[0].slug,
  );
  const [ownershipType, setOwnershipType] = useState<OwnershipType>("private-owner");
  const [relation, setRelation] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Record<string, string>>({});
  const [clientDetails, setClientDetails] = useState({
    fullName: "",
    cellphone: "",
    email: "",
    identityNumber: "",
    deliveryAddressLine1: "",
    deliveryAddressLine2: "",
    deliverySuburb: "",
    deliveryCity: "",
    deliveryProvince: "",
    deliveryPostalCode: "",
  });
  const [popiaConsent, setPopiaConsent] = useState(false);
  const [vehicleDetails, setVehicleDetails] = useState({
    registrationNumber: "",
    vin: "",
    make: "",
    model: "",
  });
  const [licenceDiskFileName, setLicenceDiskFileName] = useState("");
  const [licenceDiskScanResultInvalidated, setLicenceDiskScanResultInvalidated] = useState(false);
  const [licenceDiskScanState, scanLicenceDiskAction, scanLicenceDiskPending] = useActionState(
    scanLicenceDiskPhoto,
    initialLicenceDiskScanState,
  );
  const [vehicleDetailsConfirmed, setVehicleDetailsConfirmed] = useState(false);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const [hasMandateSignature, setHasMandateSignature] = useState(false);
  const selectedService =
    availableServices.find((service) => service.slug === selectedServiceSlug) ?? availableServices[0];
  const selectedOwnership = ownershipOptions.find((option) => option.value === ownershipType) ?? ownershipOptions[0];
  const requiredDocuments = useMemo(() => documentsByOwnership[ownershipType], [ownershipType]);
  const licenceDiskScanResultApplies =
    !licenceDiskScanResultInvalidated &&
    (licenceDiskScanState.status === "success" || licenceDiskScanState.status === "needs-review");
  const licenceDiskScanAttempted =
    !licenceDiskScanResultInvalidated &&
    (licenceDiskScanState.status === "success" ||
      licenceDiskScanState.status === "needs-review" ||
      licenceDiskScanState.status === "error");
  const effectiveVehicleDetails = {
    registrationNumber:
      vehicleDetails.registrationNumber || (licenceDiskScanResultApplies ? licenceDiskScanState.fields.registrationNumber : ""),
    vin: vehicleDetails.vin || (licenceDiskScanResultApplies ? licenceDiskScanState.fields.vin : ""),
    make: vehicleDetails.make || (licenceDiskScanResultApplies ? licenceDiskScanState.fields.make : ""),
    model: vehicleDetails.model || (licenceDiskScanResultApplies ? licenceDiskScanState.fields.model : ""),
  };
  const clientDetailsComplete = [
    clientDetails.fullName,
    clientDetails.cellphone,
    clientDetails.email,
    clientDetails.identityNumber,
    clientDetails.deliveryAddressLine1,
    clientDetails.deliveryCity,
    clientDetails.deliveryPostalCode,
  ].every((value) => value.trim().length > 0) && popiaConsent;
  const vehicleDetailsComplete =
    effectiveVehicleDetails.registrationNumber.trim().length > 0 && licenceDiskFileName.trim().length > 0;
  const selectedServiceAmount = Number(selectedService.basePrice);
  const licenceDiskScanMessage = scanLicenceDiskPending
    ? "Trying to read the licence disk photo..."
    : licenceDiskScanState.status !== "idle" && !licenceDiskScanResultInvalidated
      ? licenceDiskScanState.message
      : licenceDiskFileName
        ? "Licence disk photo selected. Enter the vehicle details from the disk below. You may try the AI scan, but manual confirmation is the source of truth."
        : "Choose a clear licence disk photo, then enter the vehicle details from the disk.";

  function nextStep() {
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function previousStep() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  function drawSignatureStart(point: Point) {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.strokeStyle = "#111827";
    context.lineWidth = 5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);
    setIsDrawingSignature(true);
    setHasMandateSignature(true);
  }

  function drawSignatureMove(point: Point) {
    if (!isDrawingSignature) {
      return;
    }

    const context = signatureCanvasRef.current?.getContext("2d");

    if (!context) {
      return;
    }

    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function stopSignatureDrawing() {
    setIsDrawingSignature(false);
  }

  function clearMandateSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasMandateSignature(false);

    if (signatureInputRef.current) {
      signatureInputRef.current.value = "";
    }
  }

  function preparePublicIntakeSubmit(event: FormEvent<HTMLFormElement>) {
    const canvas = signatureCanvasRef.current;

    if (!canvas || !signatureInputRef.current || !hasMandateSignature) {
      event.preventDefault();
      return;
    }

    signatureInputRef.current.value = canvas.toDataURL("image/png");
  }

  return (
    <section className="border border-[#d8d1c3] bg-white">
      <div className="border-b border-[#eee8dc] bg-[#fffdf8] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((step, index) => (
            <span
              key={step}
              className={[
                "border px-3 py-1.5 text-xs font-semibold",
                index === stepIndex
                  ? "border-[#1f2724] bg-[#1f2724] text-white"
                  : index < stepIndex
                    ? "border-[#1f7a4d] bg-[#f4fbf7] text-[#1f7a4d]"
                    : "border-[#d8d1c3] text-[#6b5e4f]",
              ].join(" ")}
            >
              {step}
            </span>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {stepIndex === 0 ? (
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-2xl font-semibold">Choose a service</h2>
              <p className="mt-3 text-sm leading-6 text-[#52615b]">
                Select the product or service you need. Duplicate certificate is selected by default so the current
                application flow stays focused while the service catalogue grows.
              </p>
            </div>
            <div className="grid gap-3">
              {availableServices.map((service) => {
                const isSelected = service.slug === selectedServiceSlug;
                const isGautengOnly = gautengOnlyServiceSlugs.has(service.slug);

                return (
                  <button
                    key={service.slug}
                    type="button"
                    onClick={() => setSelectedServiceSlug(service.slug)}
                    className={[
                      "border p-4 text-left",
                      isSelected ? "border-[#1f2724] bg-[#fff8df]" : "border-[#d8d1c3] bg-white",
                    ].join(" ")}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{service.name}</span>
                      <span className="flex flex-wrap justify-end gap-2">
                        {isGautengOnly ? (
                          <span className="border border-[#d8b267] bg-white px-2 py-1 text-xs font-semibold uppercase text-[#6b5e4f]">
                            Gauteng only
                          </span>
                        ) : null}
                        {isSelected ? (
                          <span className="px-2 py-1 text-xs font-semibold uppercase text-[#1f7a4d]">Selected</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-[#52615b]">{service.description}</span>
                    <span className="mt-3 block text-xs font-semibold text-[#6b5e4f]">
                      {Number(service.basePrice) > 0 ? `R${Number(service.basePrice).toFixed(2)}` : "Price to be confirmed"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {stepIndex === 1 ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <h2 className="text-2xl font-semibold">Before we ask for documents</h2>
              <p className="mt-3 text-sm leading-6 text-[#52615b]">
                License Hub first needs to understand who is making the request and how the vehicle is legally owned.
                That determines the exact document list and who must sign the mandate form.
              </p>
              <p className="mt-3 text-sm leading-6 text-[#52615b]">
                You will not upload anything on this first screen. We will guide you through a few short questions, then
                show the document checklist that applies to your situation.
              </p>
            </div>
            <aside className="border border-[#eee8dc] bg-[#fffdf8] p-4 text-sm">
              <p className="font-semibold">Selected service</p>
              <p className="mt-2 text-sm leading-5 text-[#52615b]">{selectedService.name}</p>
              {reference ? <p className="mt-2 break-all text-xs leading-5 text-[#6b5e4f]">Reference: {reference}</p> : null}
            </aside>
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div>
            <h2 className="text-2xl font-semibold">Tell us who you are</h2>
            <p className="mt-2 text-sm leading-6 text-[#52615b]">
              These details identify the person completing the application. The registered owner may be you, another
              person, an estate, or an entity.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["fullName", "Full name", "text"],
                ["cellphone", "Cellphone number", "tel"],
                ["email", "Email address", "email"],
                ["identityNumber", "ID, passport, or traffic register number", "text"],
              ].map(([field, label, type]) => (
                <label key={field} className="text-sm font-semibold">
                  {label}
                  <input
                    type={type}
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    value={clientDetails[field as keyof typeof clientDetails]}
                    onChange={(event) => {
                      const value = event.currentTarget.value;

                      setClientDetails((current) => ({
                        ...current,
                        [field]: value,
                      }));
                    }}
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 border-t border-[#eee8dc] pt-5">
              <h3 className="text-base font-semibold">Client address</h3>
              <p className="mt-1 text-sm leading-6 text-[#52615b]">
                Capture the client&apos;s current address for the application record. Delivery will be confirmed at the
                payment step if the client chooses that option.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["deliveryAddressLine1", "Address line 1"],
                  ["deliveryAddressLine2", "Address line 2"],
                  ["deliverySuburb", "Suburb"],
                  ["deliveryCity", "City"],
                  ["deliveryProvince", "Province"],
                  ["deliveryPostalCode", "Postal code"],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm font-semibold">
                    {label}
                    <input
                      className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                      value={clientDetails[field as keyof typeof clientDetails]}
                      onChange={(event) => {
                        const value = event.currentTarget.value;

                        setClientDetails((current) => ({
                          ...current,
                          [field]: value,
                        }));
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="mt-4 flex gap-3 border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={popiaConsent}
                  onChange={(event) => setPopiaConsent(event.currentTarget.checked)}
                />
                <span>I agree that License Hub may use these details to process this application.</span>
              </label>
            </div>
          </div>
        ) : null}

        {stepIndex === 3 ? (
          <div>
            <h2 className="text-2xl font-semibold">Who legally owns the vehicle?</h2>
            <p className="mt-2 text-sm leading-6 text-[#52615b]">
              Choose the option that best matches the registration document or the legal owner.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {ownershipOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = option.value === ownershipType;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setOwnershipType(option.value);
                      setRelation(option.relationPrompt);
                    }}
                    className={[
                      "border p-4 text-left",
                      isSelected ? "border-[#1f2724] bg-[#fff8df]" : "border-[#d8d1c3] bg-white",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={20} className="text-[#07315f]" aria-hidden="true" />
                      <span className="font-semibold">{option.label}</span>
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-[#52615b]">{option.description}</span>
                  </button>
                );
              })}
            </div>

            <label className="mt-5 block text-sm font-semibold">
              Your relationship to the vehicle
              <textarea
                className="mt-1 h-24 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                value={relation || selectedOwnership.relationPrompt}
                onChange={(event) => {
                  const value = event.currentTarget.value;

                  setRelation(value);
                }}
              />
            </label>
          </div>
        ) : null}

        {stepIndex === 4 ? (
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-2xl font-semibold">Confirm vehicle details</h2>
              <p className="mt-2 text-sm leading-6 text-[#52615b]">
                Upload the licence disk photo first, then enter the vehicle details from the disk. These confirmed
                values are used on the mandate form.
              </p>
              <p className="mt-3 text-sm leading-6 text-[#52615b]">
                The AI scan is available as an optional assist, but it may not read licence disks reliably. Confirmed manual
                values remain the source of truth.
              </p>
              <div className="mt-4 border border-[#d8b267] bg-[#fff8df] p-3 text-sm leading-6 text-[#6b5e4f]">
                {licenceDiskScanMessage}
                {licenceDiskScanState.confidence > 0 ? (
                  <span className="mt-2 block text-xs font-semibold">
                    AI confidence: {licenceDiskScanState.confidence}%
                  </span>
                ) : null}
              </div>
            </div>
            <div>
              <form action={scanLicenceDiskAction} className="mb-4 border border-[#07315f] bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-semibold">
                    <Upload size={18} className="text-[#07315f]" aria-hidden="true" />
                    Licence disk photo
                  </span>
                  <label className="cursor-pointer border border-[#d8d1c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#52615b]">
                    Choose Photo
                    <input
                      type="file"
                      name="licenceDiskPhoto"
                      accept="image/jpeg,image/png"
                      capture="environment"
                      className="sr-only"
                      onChange={(event) => {
                        const fileName = event.currentTarget.files?.[0]?.name ?? "";

                        setLicenceDiskFileName(fileName);
                        setLicenceDiskScanResultInvalidated(true);
                        setVehicleDetailsConfirmed(false);
                        setSelectedFiles((current) => ({
                          ...current,
                          "Licence disk photo": fileName,
                        }));
                      }}
                    />
                  </label>
                </div>
                {licenceDiskFileName ? (
                  <p className="mt-2 text-xs font-semibold text-[#1f7a4d]">{licenceDiskFileName}</p>
                ) : null}
                {scanLicenceDiskPending ? (
                  <div className="mt-3 flex items-center gap-2 border border-[#d8b267] bg-[#fff8df] px-3 py-2 text-xs font-semibold text-[#6b5e4f]">
                    <LoaderCircle size={16} className="animate-spin text-[#07315f]" aria-hidden="true" />
                    Trying to read the licence disk. If this takes too long, enter the details manually.
                  </div>
                ) : null}
                <button
                  type="submit"
                  disabled={!licenceDiskFileName || scanLicenceDiskPending}
                  onClick={() => setLicenceDiskScanResultInvalidated(false)}
                  className={[
                    "mt-3 border px-3 py-2 text-xs font-semibold",
                    licenceDiskFileName && !scanLicenceDiskPending
                      ? "border-[#1f2724] bg-[#1f2724] text-white"
                      : "cursor-not-allowed border-[#e4ded2] bg-[#e8e2d6] text-[#6b5e4f]",
                  ].join(" ")}
                >
                  {scanLicenceDiskPending ? "Scanning..." : "Try AI Scan"}
                </button>
              </form>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["registrationNumber", "Registration number"],
                  ["vin", "VIN / chassis number"],
                  ["make", "Vehicle make"],
                  ["model", "Vehicle model"],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm font-semibold">
                    {label}
                    <input
                      className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                      value={effectiveVehicleDetails[field as keyof typeof effectiveVehicleDetails]}
                      onChange={(event) => {
                        const value = event.currentTarget.value;

                        setVehicleDetailsConfirmed(false);
                        setVehicleDetails((current) => ({
                          ...current,
                          [field]: value,
                        }));
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="mt-4 flex gap-3 border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={vehicleDetailsConfirmed}
                  disabled={!vehicleDetailsComplete}
                  onChange={(event) => setVehicleDetailsConfirmed(event.currentTarget.checked)}
                />
                <span>
                  I confirm these vehicle details are correct and can be used to generate the mandate form.
                  {!vehicleDetailsComplete ? (
                    <span className="mt-1 block text-xs font-normal text-[#9a6a20]">
                      {licenceDiskScanAttempted
                        ? "Enter at least the registration number before confirming."
                        : licenceDiskFileName
                          ? "Enter at least the registration number before confirming."
                          : "Upload the licence disk photo before confirming."}
                    </span>
                  ) : null}
                </span>
              </label>
            </div>
          </div>
        ) : null}

        {stepIndex === 5 ? (
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-2xl font-semibold">Documents you will need</h2>
              <p className="mt-2 text-sm leading-6 text-[#52615b]">
                Based on the legal ownership type selected: <span className="font-semibold">{selectedOwnership.label}</span>.
              </p>
              <p className="mt-3 text-sm leading-6 text-[#52615b]">
                Once you continue, you will upload these documents and complete the digital mandate signature.
              </p>
            </div>
            <div className="grid gap-2">
              {requiredDocuments.map((document) => (
                <div key={document.label} className="border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                  <div className="flex items-start gap-3">
                    <FileText size={18} className="mt-0.5 shrink-0 text-[#07315f]" aria-hidden="true" />
                    <span>
                      <span className="block font-semibold">{document.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#6b5e4f]">{document.description}</span>
                    </span>
                  </div>
                </div>
              ))}
              <div className="mt-2 border border-[#1f7a4d] bg-[#f4fbf7] p-3 text-sm text-[#1f7a4d]">
                <span className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  Checklist ready
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {stepIndex === 6 ? (
          <form action={createPublicApplicationIntake} onSubmit={preparePublicIntakeSubmit}>
            <input type="hidden" name="serviceSlug" value={selectedService.slug} />
            <input type="hidden" name="ownershipType" value={ownershipType} />
            <input type="hidden" name="relation" value={relation || selectedOwnership.relationPrompt} />
            {Object.entries(clientDetails).map(([field, value]) => (
              <input key={field} type="hidden" name={field} value={value} />
            ))}
            <input type="hidden" name="popiaConsent" value={popiaConsent ? "on" : ""} />
            <input type="hidden" name="registrationNumber" value={effectiveVehicleDetails.registrationNumber} />
            <input type="hidden" name="vin" value={effectiveVehicleDetails.vin} />
            <input type="hidden" name="vehicleMake" value={effectiveVehicleDetails.make} />
            <input type="hidden" name="vehicleModel" value={effectiveVehicleDetails.model} />
            <input ref={signatureInputRef} type="hidden" name="signatureDataUrl" />

          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <h2 className="text-2xl font-semibold">Review and sign mandate form</h2>
              <p className="mt-2 text-sm leading-6 text-[#52615b]">
                Upload the supporting documents, then read the mandate form in full before signing. Your signature is
                only captured after the populated form is visible.
              </p>
              <p className="mt-3 text-sm leading-6 text-[#52615b]">
                These uploads are selected here so the client can see what is needed. The next build step is to save each
                file against the application record and generate the signed mandate PDF.
              </p>
            </div>
            <div className="grid gap-3">
              {requiredDocuments.map((document) => (
                <div key={document.label} className="border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <Upload size={18} className="text-[#07315f]" aria-hidden="true" />
                      {document.label}
                    </span>
                    <label className="cursor-pointer border border-[#d8d1c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#52615b]">
                      Choose File
                      <input
                        type="file"
                        name={uploadInputName(document.label)}
                        accept={
                          uploadInputName(document.label) === "proofOfAddress"
                            ? "image/jpeg,image/png,application/pdf"
                            : "image/jpeg,image/png"
                        }
                        capture={uploadInputName(document.label) === "proofOfAddress" ? undefined : "environment"}
                        required={["idPhoto", "licenceDiskPhoto", "proofOfAddress"].includes(
                          uploadInputName(document.label),
                        )}
                        className="sr-only"
                        onChange={(event) => {
                          const fileName = event.currentTarget.files?.[0]?.name;

                          setSelectedFiles((current) => ({
                            ...current,
                            [document.label]: fileName ?? "",
                          }));
                        }}
                      />
                    </label>
                  </div>
                  {selectedFiles[document.label] ? (
                    <p className="mt-2 text-xs font-semibold text-[#1f7a4d]">{selectedFiles[document.label]}</p>
                  ) : null}
                </div>
              ))}
              <div className="border border-[#07315f] bg-white p-4 text-sm">
                <span className="flex items-center gap-2 text-base font-semibold">
                  <PenLine size={18} className="text-[#07315f]" aria-hidden="true" />
                  Mandate form
                </span>
                <div className="mt-4 border border-[#d8d1c3] bg-[#fffdf8] p-4 leading-6 text-[#1f2724]">
                  <p className="text-center text-base font-semibold uppercase">
                    Request letter for duplicate vehicle registration document
                  </p>
                  <p className="mt-4">To Whom This May Concern</p>
                  <p className="mt-3">
                    I, <span className="font-semibold">{clientDetails.fullName || "Client name"}</span>, hereby state
                    that I require assistance with my selected License Hub service,{" "}
                    <span className="font-semibold">{selectedService.name}</span>.
                  </p>
                  <p className="mt-3">
                    I request License Hub&apos;s assistance in preparing and submitting the required vehicle
                    administration documents on my behalf, using the details I have provided and confirmed in this
                    application.
                  </p>
                  <dl className="mt-4 grid gap-3 border-t border-[#eee8dc] pt-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Client</dt>
                      <dd className="font-medium">{clientDetails.fullName || "To be confirmed"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">ID / passport / traffic register</dt>
                      <dd className="font-medium">{clientDetails.identityNumber || "To be confirmed"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Registration</dt>
                      <dd className="font-medium">{effectiveVehicleDetails.registrationNumber || "To be confirmed"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">VIN / chassis</dt>
                      <dd className="font-medium">{effectiveVehicleDetails.vin || "To be confirmed"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Make</dt>
                      <dd className="font-medium">{effectiveVehicleDetails.make || "To be confirmed"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Model</dt>
                      <dd className="font-medium">{effectiveVehicleDetails.model || "To be confirmed"}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Relationship to vehicle</dt>
                      <dd className="font-medium">{relation || selectedOwnership.relationPrompt}</dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <label className="font-semibold" htmlFor="public-mandate-signature-pad">
                      Signature
                    </label>
                    <button
                      type="button"
                      onClick={clearMandateSignature}
                      className="border border-[#d8d1c3] px-3 py-1.5 text-xs font-semibold text-[#6b5e4f]"
                    >
                      Clear
                    </button>
                  </div>
                  <canvas
                    ref={signatureCanvasRef}
                    id="public-mandate-signature-pad"
                    width={900}
                    height={360}
                    className="mt-2 h-56 w-full touch-none border-2 border-[#07315f] bg-white sm:h-64"
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      drawSignatureStart(canvasPoint(event.currentTarget, event.clientX, event.clientY));
                    }}
                    onPointerMove={(event) => drawSignatureMove(canvasPoint(event.currentTarget, event.clientX, event.clientY))}
                    onPointerUp={stopSignatureDrawing}
                    onPointerCancel={stopSignatureDrawing}
                    onPointerLeave={stopSignatureDrawing}
                    aria-label="Signature pad"
                  />
                  <p className="mt-2 text-xs leading-5 text-[#6b5e4f]">
                    Sign inside the box after reading the mandate form above. Use your finger on mobile.
                  </p>
                  {!hasMandateSignature ? (
                    <p className="mt-1 text-xs font-semibold text-[#8a6a2a]">
                      Signature required before payment can be requested.
                    </p>
                  ) : null}
                </div>
              </div>
              <SubmitApplicationButton />
            </div>
          </div>
          </form>
        ) : null}

        {stepIndex === 7 ? (
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-2xl font-semibold">Payment request</h2>
              <p className="mt-2 text-sm leading-6 text-[#52615b]">
                After the required details, documents and mandate signature are captured, License Hub can request payment
                for the selected service.
              </p>
              <p className="mt-3 text-sm leading-6 text-[#52615b]">
                The production payment step can offer Paystack card payment and EFT instructions once those rules are
                confirmed.
              </p>
            </div>
            <aside className="border border-[#d8d1c3] bg-[#fffdf8] p-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <CreditCard size={20} className="text-[#07315f]" aria-hidden="true" />
                Amount due
              </h3>
              <p className="mt-4 text-3xl font-semibold">
                {selectedServiceAmount > 0 ? `R${selectedServiceAmount.toFixed(2)}` : "To be confirmed"}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#6b5e4f]">{selectedService.name}</p>
              <p className="mt-2 text-sm leading-6 text-[#6b5e4f]">
                Payment is requested only after the application details and required documents are captured.
              </p>
              <p className="mt-5 border border-[#d8b267] bg-[#fff8df] p-3 text-sm font-semibold text-[#6b5e4f]">
                Payment is requested after the mandate form and documents are saved.
              </p>
            </aside>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-[#eee8dc] pt-5">
          <button
            type="button"
            onClick={previousStep}
            disabled={stepIndex === 0}
            className={[
              "inline-flex items-center gap-2 border px-4 py-2 text-sm font-semibold",
              stepIndex === 0
                ? "cursor-not-allowed border-[#e4ded2] text-[#a39b8f]"
                : "border-[#d8d1c3] text-[#52615b]",
            ].join(" ")}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>
          <button
            type="button"
            onClick={nextStep}
            disabled={
              stepIndex === steps.length - 1 ||
              (stepIndex === 2 && !clientDetailsComplete) ||
              (stepIndex === 4 && (!vehicleDetailsConfirmed || !vehicleDetailsComplete)) ||
              stepIndex === 6
            }
            className={[
              "inline-flex items-center gap-2 border px-4 py-2 text-sm font-semibold",
              stepIndex === steps.length - 1 ||
              (stepIndex === 2 && !clientDetailsComplete) ||
              (stepIndex === 4 && (!vehicleDetailsConfirmed || !vehicleDetailsComplete)) ||
              stepIndex === 6
                ? "cursor-not-allowed border-[#e4ded2] bg-[#e8e2d6] text-[#6b5e4f]"
                : "border-[#1f2724] bg-[#1f2724] text-white",
            ].join(" ")}
          >
            Proceed
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

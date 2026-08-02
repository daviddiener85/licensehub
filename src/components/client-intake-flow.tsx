"use client";

import type { FormEvent } from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CreditCard,
  LoaderCircle,
  PenLine,
  Scale,
  Upload,
  UserRound,
} from "lucide-react";

import { createPublicApplicationIntake, scanLicenceDiskPhoto } from "@/lib/workflow-actions";

type OwnershipType = "private-owner" | "deceased-estate" | "company-or-trust" | "non-sa-citizen";
type CitizenshipStatus = "" | "sa-citizen" | "foreigner";

type IntakeService = {
  slug: string;
  name: string;
  description: string;
  basePrice: string;
  deliveryFee: string;
  requiresQuote: boolean;
};

type ClientIntakeFlowProps = {
  reference?: string;
  services?: IntakeService[];
  initialServiceSlug?: string;
  paystackEnabled?: boolean;
};

type PaymentChoice = "EFT" | "PAYSTACK";
type UploadFieldName = "idPhoto" | "licenceDiskPhoto" | "proofOfAddress" | "passportDocument" | "trafficRegisterDocument";

type Point = {
  x: number;
  y: number;
};

const fallbackServices: IntakeService[] = [
  {
    slug: "duplicate-certificate",
    name: "Duplicate Certificate",
    description: "Replacement of lost vehicle certificates.",
    basePrice: "499",
    deliveryFee: "0",
    requiresQuote: false,
  },
  {
    slug: "change-of-ownership",
    name: "Change of Ownership",
    description: "Vehicle ownership transfer assistance. Available in Gauteng only.",
    basePrice: "0",
    deliveryFee: "0",
    requiresQuote: true,
  },
  {
    slug: "licence-renewal",
    name: "License Fees",
    description: "Vehicle license fee renewal assistance. Available in Gauteng only.",
    basePrice: "0",
    deliveryFee: "0",
    requiresQuote: true,
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

const initialPublicIntakeSubmitState = {
  status: "idle" as const,
  message: "",
  redirectTo: undefined,
};

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const IMAGE_UPLOAD_TYPES = new Set(["image/jpeg", "image/png"]);
const DOCUMENT_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "application/pdf"]);

function formatUploadTypeList(types: ReadonlySet<string>) {
  return Array.from(types)
    .map((type) => {
      if (type === "application/pdf") {
        return "PDF";
      }

      return type.split("/")[1]?.toUpperCase() ?? type;
    })
    .join(", ");
}

function validateSelectedUpload(file: File, acceptedTypes: ReadonlySet<string>, label: string) {
  if (!acceptedTypes.has(file.type)) {
    return `${label} must be one of the accepted file types: ${formatUploadTypeList(acceptedTypes)}.`;
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `${label} must be smaller than 10 MB.`;
  }

  return null;
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidSouthAfricanIdNumber(value: string) {
  const digits = normalizeDigits(value);

  if (!/^\d{13}$/.test(digits)) {
    return false;
  }

  let sum = 0;

  for (let index = 0; index < 12; index += 1) {
    let digit = Number(digits[index]);

    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
  }

  const checkDigit = Number(digits[12]);
  return (10 - (sum % 10)) % 10 === checkDigit;
}

function isValidSouthAfricanPhoneNumber(value: string) {
  return /^0\d{9}$/.test(normalizeDigits(value));
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidRegisterNumber(value: string) {
  return /^[A-Za-z0-9]+$/.test(value.trim());
}

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
    description: "The vehicle is registered to an individual owner (South African or foreign).",
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
];

const ownershipDocumentsByType: Record<OwnershipType, { key: string; label: string; description: string }[]> = {
  "private-owner": [
    { key: "id-photo", label: "ID photo", description: "A clear photo of the owner's ID." },
    { key: "licence-disk", label: "Licence disk photo", description: "A clear photo showing the vehicle registration details." },
    { key: "proof-of-address", label: "Proof of address", description: "A document dated within the last 3 months." },
  ],
  "deceased-estate": [
    { key: "id-photo", label: "Executor or representative ID", description: "A clear photo of the person handling the estate request." },
    { key: "death-certificate", label: "Death certificate", description: "Proof that the registered owner is deceased." },
    { key: "executor-authority", label: "Executor authority document", description: "Letter of executorship or authority to act for the estate." },
    { key: "licence-disk", label: "Licence disk photo", description: "A clear photo showing the vehicle registration details." },
    { key: "proof-of-address", label: "Proof of address", description: "A document dated within the last 3 months." },
  ],
  "company-or-trust": [
    { key: "id-photo", label: "Representative ID photo", description: "A clear photo of the authorised signer." },
    { key: "registration-or-trust-document", label: "Company or trust registration document", description: "CIPC document, trust deed, or equivalent entity document." },
    { key: "representative-authority", label: "Authority to act", description: "Resolution, letter, or proof that the signer may act for the entity." },
    { key: "licence-disk", label: "Licence disk photo", description: "A clear photo showing the vehicle registration details." },
    { key: "proof-of-address", label: "Proof of address", description: "A document dated within the last 3 months." },
  ],
  "non-sa-citizen": [
    { key: "traffic-register-document", label: "Traffic register document (TRN)", description: "A clear TRN document for the owner." },
    { key: "passport-document", label: "Passport document", description: "A clear passport document for the owner." },
    { key: "licence-disk", label: "Licence disk photo", description: "A clear photo showing the vehicle registration details." },
    { key: "proof-of-address", label: "Proof of address", description: "A document dated within the last 3 months." },
  ],
};

const changeOfOwnershipDocuments = [
  { key: "rc1", label: "Registration document (Original RC1)", description: "The original registration certificate for the vehicle." },
  { key: "current-owner-id", label: "Current owner ID", description: "A clear copy of the current owner's ID." },
  {
    key: "current-owner-proof-of-address",
    label: "Current owner proof of address",
    description: "Must not be older than three months.",
  },
  { key: "new-owner-id", label: "New owner ID", description: "A clear copy of the new owner's ID." },
  {
    key: "new-owner-proof-of-address",
    label: "New owner proof of address",
    description: "Must not be older than three months.",
  },
] as const;

const licenceFeeRenewalDocuments = [
  { key: "id-photo", label: "ID photo", description: "A clear photo of the owner's ID." },
  { key: "proof-of-address", label: "Proof of address", description: "Must not be older than three months." },
] as const;

const steps = [
  "Service",
  "Start",
  "Vehicle Relationship",
  "Who You Are",
  "Vehicle Details",
  "Referral",
  "Mandate Form",
  "Payment",
] as const;

const stepSummaries = [
  "Choose the service you want to complete.",
  "Confirm the request before you add details.",
  "Tell us who legally owns the vehicle.",
  "Share the contact and ID details for the person completing this.",
  "Confirm the vehicle details from the licence disk.",
  "Tell us who referred you and where completed documents should go.",
  "Upload files and sign the mandate.",
  "Choose how you want to pay and submit.",
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

function SubmitApplicationButton({ quoteFlow, disabled }: { quoteFlow: boolean; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = Boolean(disabled) || pending;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={[
        "mt-5 w-full border px-4 py-3 text-sm font-black uppercase tracking-wide",
        isDisabled
          ? "cursor-wait border-[#e4ded2] bg-[#e8e2d6] text-[#6b5e4f]"
          : "tlh-button-primary",
      ].join(" ")}
    >
      {pending ? "Saving application..." : quoteFlow ? "Submit For Quote" : "Submit Application"}
    </button>
  );
}

function uploadInputName(documentLabel: string) {
  const normalizedLabel = documentLabel.toLowerCase();

  if (normalizedLabel.includes("traffic register") || normalizedLabel.includes("trn")) {
    return "trafficRegisterDocument";
  }

  if (normalizedLabel.includes("passport")) {
    return "passportDocument";
  }

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

function isMandateStepUpload(documentLabel: string) {
  return uploadInputName(documentLabel) !== "licenceDiskPhoto";
}

export function ClientIntakeFlow({
  reference,
  services = fallbackServices,
  initialServiceSlug,
  paystackEnabled = false,
}: ClientIntakeFlowProps) {
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const fullNameInputRef = useRef<HTMLInputElement>(null);
  const stepContentTopRef = useRef<HTMLDivElement>(null);
  const licenceDiskScanFormRef = useRef<HTMLFormElement>(null);
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
    initialServiceSlug && availableServices.some((service) => service.slug === initialServiceSlug)
      ? initialServiceSlug
      : availableServices.some((service) => service.slug === "duplicate-certificate")
      ? "duplicate-certificate"
      : availableServices[0].slug,
  );
  const [ownershipType, setOwnershipType] = useState<OwnershipType | "">("");
  const [ownershipTypeError, setOwnershipTypeError] = useState("");
  const [citizenshipStatus, setCitizenshipStatus] = useState<CitizenshipStatus>("");
  const [identityNumberTouched, setIdentityNumberTouched] = useState(false);
  const [relation, setRelation] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [referralOther, setReferralOther] = useState("");
  const [referralContact, setReferralContact] = useState("");
  const [sendCompletedDocumentsToReferrer, setSendCompletedDocumentsToReferrer] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, string>>({});
  const [uploadedFiles, setUploadedFiles] = useState<Partial<Record<UploadFieldName, File | null>>>({});
  const [uploadError, setUploadError] = useState("");
  const [clientDetails, setClientDetails] = useState({
    fullName: "",
    cellphone: "",
    email: "",
    identityNumber: "",
    passportNumber: "",
    trnNumber: "",
    deliveryAddressLine1: "",
    deliveryAddressLine2: "",
    deliverySuburb: "",
    deliveryCity: "",
    deliveryProvince: "",
    deliveryPostalCode: "",
  });
  const [entityDetails, setEntityDetails] = useState({
    entityDisplayName: "",
    entityRegistrationNumber: "",
    deceasedFullName: "",
    deceasedIdNumber: "",
    representativeFullName: "",
    representativeCapacity: "",
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
  const [publicIntakeSubmitState, createPublicApplicationIntakeAction] = useActionState(
    createPublicApplicationIntake,
    initialPublicIntakeSubmitState,
  );
  const [vehicleDetailsConfirmed, setVehicleDetailsConfirmed] = useState(false);
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const [hasMandateSignature, setHasMandateSignature] = useState(false);
  const [step3ProceedAttempted, setStep3ProceedAttempted] = useState(false);
  const [step6ProceedAttempted, setStep6ProceedAttempted] = useState(false);
  const [deliveryRequired, setDeliveryRequired] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>("EFT");
  const selectedService =
    availableServices.find((service) => service.slug === selectedServiceSlug) ?? availableServices[0];
  const isQuoteFlowService = selectedService.requiresQuote;
  const effectiveOwnershipType: OwnershipType =
    ownershipType === "private-owner" && citizenshipStatus === "foreigner" ? "non-sa-citizen" : ownershipType || "private-owner";
  const selectedOwnership = ownershipOptions.find((option) => option.value === ownershipType) ?? ownershipOptions[0];
  const requiredDocuments = useMemo(() => {
    if (selectedServiceSlug === "change-of-ownership") {
      const entitySupportingDocuments = ownershipDocumentsByType[effectiveOwnershipType].filter((document) =>
        [
          "death-certificate",
          "executor-authority",
          "registration-or-trust-document",
          "representative-authority",
          "traffic-register-document",
          "passport-document",
        ].includes(document.key),
      );
      const serviceDocuments = changeOfOwnershipDocuments.map((document) => {
        if (document.key !== "current-owner-id") {
          return document;
        }

        if (effectiveOwnershipType === "deceased-estate") {
          return {
            ...document,
            label: "Executor or estate representative ID",
            description: "A clear copy of the ID for the person authorised to act for the estate.",
          };
        }

        if (effectiveOwnershipType === "company-or-trust") {
          return {
            ...document,
            label: "Company or trust representative ID",
            description: "A clear copy of the authorised representative's ID.",
          };
        }

        return document;
      });

      return [...serviceDocuments, ...entitySupportingDocuments];
    }

    if (selectedServiceSlug === "licence-renewal") {
      return effectiveOwnershipType === "private-owner"
        ? licenceFeeRenewalDocuments
        : ownershipDocumentsByType[effectiveOwnershipType];
    }

    return ownershipDocumentsByType[effectiveOwnershipType];
  }, [effectiveOwnershipType, selectedServiceSlug]);

  function selectService(serviceSlug: string) {
    setSelectedServiceSlug(serviceSlug);

    const url = new URL(window.location.href);
    url.searchParams.set("service", serviceSlug);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
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
  const identityDetailsComplete =
    citizenshipStatus === "foreigner"
      ? clientDetails.passportNumber.trim().length > 0 && clientDetails.trnNumber.trim().length > 0
      : citizenshipStatus === "sa-citizen"
        ? clientDetails.identityNumber.trim().length > 0
        : false;
  const clientDetailsComplete = [
    clientDetails.fullName,
    clientDetails.cellphone,
    clientDetails.email,
    clientDetails.deliveryAddressLine1,
    clientDetails.deliveryCity,
    clientDetails.deliveryPostalCode,
  ].every((value) => value.trim().length > 0) && citizenshipStatus.length > 0 && identityDetailsComplete && popiaConsent;
  const clientValidationErrors = {
    identityNumber:
      citizenshipStatus === "sa-citizen" &&
      clientDetails.identityNumber.trim().length > 0 &&
      !isValidSouthAfricanIdNumber(clientDetails.identityNumber)
        ? "Enter a valid 13-digit South African ID number with a correct Luhn check digit."
        : "",
    cellphone:
      clientDetails.cellphone.trim().length > 0 && !isValidSouthAfricanPhoneNumber(clientDetails.cellphone)
        ? "Enter a valid 10-digit South African cellphone number."
        : "",
    email:
      clientDetails.email.trim().length > 0 && !isValidEmailAddress(clientDetails.email)
        ? "Enter a valid email address."
        : "",
    register:
      effectiveVehicleDetails.registrationNumber.trim().length > 0 &&
      !isValidRegisterNumber(effectiveVehicleDetails.registrationNumber)
        ? "Register may contain letters and numbers only."
        : "",
  };
  const vehicleDetailsComplete =
    effectiveVehicleDetails.registrationNumber.trim().length > 0 &&
    licenceDiskFileName.trim().length > 0 &&
    !clientValidationErrors.register;
  const selectedServiceAmount = Number(selectedService.basePrice);
  const selectedServiceDeliveryFee = Number(selectedService.deliveryFee);
  const selectedServiceDisplayAmount =
    Number.isFinite(selectedServiceAmount) && selectedServiceAmount > 0 ? selectedServiceAmount : 0;
  const selectedServiceDisplayDeliveryFee =
    Number.isFinite(selectedServiceDeliveryFee) && selectedServiceDeliveryFee > 0 ? selectedServiceDeliveryFee : 0;
  const requiredUploadLabels = requiredDocuments
    .filter((document) => isMandateStepUpload(document.label))
    .filter((document) => {
      const inputName =
        selectedService.slug === "change-of-ownership" ? "supportingDocument" : uploadInputName(document.label);
      if (effectiveOwnershipType === "non-sa-citizen") {
        return ["passportDocument", "trafficRegisterDocument", "proofOfAddress"].includes(inputName);
      }

      return ["idPhoto", "proofOfAddress"].includes(inputName);
    })
    .map((document) => document.label);
  const requiredUploadsReady = requiredUploadLabels.every((label) => {
    return Boolean(selectedFiles[label]?.trim());
  });
  const showLicenceRenewalDisclaimer = selectedService.slug === "licence-renewal";
  const nonSaIdentityPreview = [clientDetails.passportNumber, clientDetails.trnNumber]
    .filter((value) => value.trim().length > 0)
    .join(" / ");
  const licenceDiskScanMessage = scanLicenceDiskPending
    ? "Trying to read the licence disk photo..."
    : licenceDiskScanState.status !== "idle" && !licenceDiskScanResultInvalidated
      ? licenceDiskScanState.message
      : licenceDiskFileName
        ? "Licence disk photo selected. AI scan will start automatically. Manual confirmation is still the source of truth."
        : "Choose a clear licence disk photo, then enter the vehicle details from the disk.";

  useEffect(() => {
    const stepTop = stepContentTopRef.current;

    if (!stepTop) {
      return;
    }

    const section = stepTop.closest("section");
    const progressBar = section?.querySelector("div.border-b.border-\\[\\#eee8dc\\]") as HTMLDivElement | null;
    const progressHeight = progressBar?.offsetHeight ?? 0;
    const targetY = stepTop.getBoundingClientRect().top + window.scrollY - progressHeight - 8;

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: Math.max(0, targetY),
        behavior: "smooth",
      });
    });
  }, [stepIndex]);

  const effectivePaymentMethod: PaymentChoice = paystackEnabled ? paymentMethod : "EFT";

  useEffect(() => {
    if (publicIntakeSubmitState.status !== "success" || !publicIntakeSubmitState.redirectTo) {
      return;
    }

    window.location.assign(publicIntakeSubmitState.redirectTo);
  }, [publicIntakeSubmitState]);

  useEffect(() => {
    if (stepIndex !== 3) {
      return;
    }

    const fullNameInput = fullNameInputRef.current;

    if (!fullNameInput) {
      return;
    }

    window.requestAnimationFrame(() => {
      fullNameInput.scrollIntoView({ behavior: "smooth", block: "start" });
      fullNameInput.focus();
    });
  }, [stepIndex]);

  function nextStep() {
    if (stepIndex === 2 && !ownershipType) {
      setOwnershipTypeError("Select who owns the vehicle before continuing.");
      return;
    }

    if (stepIndex === 3 && !clientDetailsComplete) {
      setStep3ProceedAttempted(true);
      return;
    }

    if (stepIndex === 6 && (!hasMandateSignature || !requiredUploadsReady)) {
      setStep6ProceedAttempted(true);
      return;
    }

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

  const step3ProceedBlocked = stepIndex === 3 && !clientDetailsComplete;
  const step6ProceedBlocked = stepIndex === 6 && (!hasMandateSignature || !requiredUploadsReady);

  async function submitPublicIntake(formData: FormData) {
    formData.set("identityNumber", clientDetails.identityNumber.trim());
    formData.set("passportNumber", clientDetails.passportNumber.trim());
    formData.set("trnNumber", clientDetails.trnNumber.trim());

    const uploadFieldNames: UploadFieldName[] = [
      "idPhoto",
      "licenceDiskPhoto",
      "proofOfAddress",
      "trafficRegisterDocument",
      "passportDocument",
    ];

    for (const fieldName of uploadFieldNames) {
      const submittedFile = formData.get(fieldName);
      const storedFile = uploadedFiles[fieldName];

      if (
        (!(submittedFile instanceof File) || submittedFile.size === 0) &&
        storedFile instanceof File &&
        storedFile.size > 0
      ) {
        formData.set(fieldName, storedFile, storedFile.name);
      }
    }

    await createPublicApplicationIntakeAction(formData);
  }

  return (
    <section className="tlh-panel overflow-hidden">
      <div className="border-b border-[#ff9f0a]/30 bg-[#111719] px-4 py-4 text-white sm:px-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb84d]">
              Step {stepIndex + 1} of {steps.length}
            </p>
            <span className="text-xs font-black uppercase tracking-[0.12em] text-white/76">{steps[stepIndex]}</span>
          </div>
          <div className="h-2 overflow-hidden bg-white/12">
            <div
              className="h-full bg-[#ff9f0a]"
              style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
          <p className="max-w-2xl text-sm leading-6 text-white/68">{stepSummaries[stepIndex]}</p>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div ref={stepContentTopRef} />
        {stepIndex === 0 ? (
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-2xl font-black uppercase">Choose a service</h2>
              <p className="mt-3 text-sm leading-6 text-[#52615b]">Duplicate certificate is selected by default.</p>
            </div>
            <div className="grid gap-3">
              {availableServices.map((service) => {
                const isSelected = service.slug === selectedServiceSlug;
                const isGautengOnly = gautengOnlyServiceSlugs.has(service.slug);

                return (
                  <button
                    key={service.slug}
                    type="button"
                    onClick={() => selectService(service.slug)}
                    className={[
                      "border p-4 text-left transition",
                      isSelected
                        ? "border-[#ff9f0a] bg-[#111719] text-white shadow-xl"
                        : "border-[#d8d1c3] bg-white hover:border-[#ff9f0a]",
                    ].join(" ")}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-black uppercase">{service.name}</span>
                      <span className="flex flex-wrap justify-end gap-2">
                        {isGautengOnly ? (
                          <span className="border border-[#ff9f0a]/45 bg-[#ff9f0a]/12 px-2 py-1 text-xs font-black uppercase text-[#ffb84d]">
                            Gauteng only
                          </span>
                        ) : null}
                        {isSelected ? (
                          <span className="px-2 py-1 text-xs font-black uppercase text-[#ff9f0a]">Selected</span>
                        ) : null}
                      </span>
                    </span>
                    <span className={["mt-2 block text-sm leading-6", isSelected ? "text-white/70" : "text-[#52615b]"].join(" ")}>
                      {service.description}
                    </span>
                    <span className={["mt-3 block text-xs font-black uppercase", isSelected ? "text-[#ffb84d]" : "text-[#6b5e4f]"].join(" ")}>
                      {service.requiresQuote
                        ? "Price to be confirmed"
                        : `R${Number(service.basePrice).toFixed(2)}`}
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
                We first confirm who is making the request and how the vehicle is owned.
              </p>
            </div>
            <aside className="border border-[#eee8dc] bg-[#fffdf8] p-4 text-sm">
              <p className="font-semibold">Selected service</p>
              <p className="mt-2 text-sm leading-5 text-[#52615b]">{selectedService.name}</p>
              {showLicenceRenewalDisclaimer ? (
                <p className="mt-3 border border-[#d8b267] bg-[#fff8df] p-3 text-xs leading-5 text-[#6b5e4f]">
                  If any other vehicle license discs are outstanding, this license disc will not print and only an
                  MVLX will be supplied. The license fee will still be paid up to date.
                </p>
              ) : null}
              {reference ? <p className="mt-2 break-all text-xs leading-5 text-[#6b5e4f]">Reference: {reference}</p> : null}
            </aside>
          </div>
        ) : null}

        {stepIndex === 3 ? (
          <div>
            <h2 className="text-2xl font-semibold">Your details</h2>
            <p className="mt-2 text-sm leading-6 text-[#52615b]">
              Enter the contact and ID details for the person completing this request.
            </p>
            <label className="mt-5 block text-sm font-semibold">
              Citizenship status
              <select
                className="mt-1 w-full border border-[#d8d1c3] bg-white px-3 py-2 font-normal"
                value={citizenshipStatus}
                onChange={(event) => setCitizenshipStatus(event.currentTarget.value as CitizenshipStatus)}
              >
                <option value="">Select one</option>
                <option value="sa-citizen">South African citizen</option>
                <option value="foreigner">Foreigner</option>
              </select>
            </label>

            {citizenshipStatus.length === 0 ? (
              <p className="mt-4 border border-[#d8b267] bg-[#fff8df] p-3 text-sm font-semibold text-[#6b5e4f]">
                Select citizenship status to continue with the form.
              </p>
            ) : null}

            {citizenshipStatus.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["fullName", "Full name", "text"],
                  ["cellphone", "Cellphone number", "tel"],
                  ["email", "Email address", "email"],
                  ...(
                    citizenshipStatus === "foreigner"
                      ? ([
                          ["passportNumber", "Passport number", "text"],
                          ["trnNumber", "TRN number", "text"],
                        ] as const)
                      : ([["identityNumber", "ID number", "text"]] as const)
                  ),
                ].map(([field, label, type]) => (
                  <label key={field} className="text-sm font-semibold">
                    {label}
                    <input
                      type={type}
                      ref={field === "fullName" ? fullNameInputRef : undefined}
                      pattern={
                        field === "cellphone"
                          ? "0\\d{9}"
                          : field === "email"
                            ? "[^\\s@]+@[^\\s@]+\\.[^\\s@]+"
                            : field === "identityNumber"
                              ? "\\d{13}"
                              : undefined
                      }
                      className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                      value={clientDetails[field as keyof typeof clientDetails]}
                      onChange={(event) => {
                        const value = event.currentTarget.value;

                        setClientDetails((current) => ({
                          ...current,
                          [field]: value,
                        }));
                      }}
                      onBlur={() => {
                        if (field === "identityNumber") {
                          setIdentityNumberTouched(true);
                        }
                      }}
                    />
                    {field === "identityNumber" && identityNumberTouched && clientValidationErrors.identityNumber ? (
                      <span className="mt-1 block font-normal text-[#7d3128]">{clientValidationErrors.identityNumber}</span>
                    ) : null}
                    {field === "cellphone" && clientValidationErrors.cellphone ? (
                      <span className="mt-1 block font-normal text-[#7d3128]">{clientValidationErrors.cellphone}</span>
                    ) : null}
                    {field === "email" && clientValidationErrors.email ? (
                      <span className="mt-1 block font-normal text-[#7d3128]">{clientValidationErrors.email}</span>
                    ) : null}
                  </label>
                ))}
              </div>
            ) : null}

            {citizenshipStatus.length > 0 ? (
              <div className="mt-6 border-t border-[#eee8dc] pt-5">
                <h3 className="text-base font-semibold">Client address</h3>
                <p className="mt-1 text-sm leading-6 text-[#52615b]">We only use this if delivery is needed later.</p>
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
                  <span>I agree that The License Hub may use these details to process this application.</span>
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div>
            <h2 className="text-2xl font-semibold">Who owns the vehicle?</h2>
            <p className="mt-2 text-sm leading-6 text-[#52615b]">Choose the closest match.</p>
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
                      setOwnershipTypeError("");
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

            {ownershipTypeError ? (
              <p className="mt-4 border border-[#b35448] bg-[#fff5f3] p-3 text-sm font-semibold text-[#7d3128]">
                {ownershipTypeError}
              </p>
            ) : null}

            {ownershipType === "company-or-trust" ? (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Company or trust legal name
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    required
                    value={entityDetails.entityDisplayName}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        entityDisplayName: value,
                      }));
                    }}
                  />
                </label>
                <label className="text-sm font-semibold">
                  BRNC number
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    required
                    value={entityDetails.entityRegistrationNumber}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        entityRegistrationNumber: value,
                      }));
                    }}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Representative full name
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    required
                    value={entityDetails.representativeFullName}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        representativeFullName: value,
                      }));
                    }}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Representative role/capacity
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    placeholder="Director, trustee, authorised agent"
                    required
                    value={entityDetails.representativeCapacity}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        representativeCapacity: value,
                      }));
                    }}
                  />
                </label>
              </div>
                {step3ProceedBlocked ? (
                  <p className="mt-4 border border-[#b35448] bg-[#fff5f3] p-3 text-sm font-semibold text-[#7d3128]">
                    Complete the required details on this step before continuing.
                  </p>
                ) : null}
              </>
            ) : null}

            {ownershipType === "deceased-estate" ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Estate name or reference
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    required
                    value={entityDetails.entityDisplayName}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        entityDisplayName: value,
                      }));
                    }}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Deceased full name
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    required
                    value={entityDetails.deceasedFullName}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        deceasedFullName: value,
                      }));
                    }}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Deceased ID number
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    required
                    value={entityDetails.deceasedIdNumber}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        deceasedIdNumber: value,
                      }));
                    }}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Executor/letter reference number
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    required
                    value={entityDetails.entityRegistrationNumber}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        entityRegistrationNumber: value,
                      }));
                    }}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Representative full name
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    required
                    value={entityDetails.representativeFullName}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        representativeFullName: value,
                      }));
                    }}
                  />
                </label>
                <label className="text-sm font-semibold">
                  Representative role/capacity
                  <input
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    placeholder="Executor, estate representative"
                    required
                    value={entityDetails.representativeCapacity}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEntityDetails((current) => ({
                        ...current,
                        representativeCapacity: value,
                      }));
                    }}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {stepIndex === 4 ? (
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-2xl font-semibold">Vehicle details</h2>
              <p className="mt-2 text-sm leading-6 text-[#52615b]">
                Upload the licence disk photo, then confirm the details below.
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
              <form
                ref={licenceDiskScanFormRef}
                action={scanLicenceDiskAction}
                className="mb-4 border border-[#07315f] bg-white p-4 text-sm"
              >
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
                      className="sr-only"
                      onChange={(event) => {
                        const selectedFile = event.currentTarget.files?.[0] ?? null;
                        const fileName = selectedFile?.name ?? "";

                        if (selectedFile) {
                          const validationError = validateSelectedUpload(selectedFile, IMAGE_UPLOAD_TYPES, "Licence disk photo");
                          if (validationError) {
                            setUploadError(validationError);
                            event.currentTarget.value = "";
                            setLicenceDiskFileName("");
                            setLicenceDiskScanResultInvalidated(true);
                            setVehicleDetailsConfirmed(false);
                            setUploadedFiles((current) => ({
                              ...current,
                              licenceDiskPhoto: null,
                            }));
                            setSelectedFiles((current) => {
                              const next = { ...current };
                              delete next["Licence disk photo"];
                              return next;
                            });
                            return;
                          }
                        }

                        setUploadError("");
                        setLicenceDiskFileName(fileName);
                        setLicenceDiskScanResultInvalidated(true);
                        setVehicleDetailsConfirmed(false);
                        setUploadedFiles((current) => ({
                          ...current,
                          licenceDiskPhoto: selectedFile,
                        }));
                        setSelectedFiles((current) => ({
                          ...current,
                          "Licence disk photo": fileName,
                        }));

                        if (selectedFile) {
                          setLicenceDiskScanResultInvalidated(false);
                          window.requestAnimationFrame(() => {
                            licenceDiskScanFormRef.current?.requestSubmit();
                          });
                        }
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
                {licenceDiskScanAttempted ? (
                  <button
                    type="submit"
                    disabled={!licenceDiskFileName || scanLicenceDiskPending}
                    onClick={() => setLicenceDiskScanResultInvalidated(false)}
                    className={[
                      "mt-3 border px-3 py-2 text-xs font-black uppercase tracking-wide",
                      licenceDiskFileName && !scanLicenceDiskPending
                        ? "tlh-button-dark"
                        : "cursor-not-allowed border-[#e4ded2] bg-[#e8e2d6] text-[#6b5e4f]",
                    ].join(" ")}
                    >
                      Retry AI Scan
                    </button>
                ) : null}
                {uploadError ? (
                  <p className="mt-3 border border-[#b35448] bg-[#fff5f3] px-3 py-2 text-xs font-semibold text-[#7d3128]">
                    {uploadError}
                  </p>
                ) : null}
              </form>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["registrationNumber", "Register"],
                  ["vin", "VIN / chassis number"],
                  ["make", "Vehicle make"],
                  ["model", "Vehicle model"],
                ].map(([field, label]) => (
                  <label key={field} className="text-sm font-semibold">
                    {label}
                    <input
                      className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                      pattern="[A-Za-z0-9]+"
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
                    {field === "registrationNumber" && clientValidationErrors.register ? (
                      <span className="mt-1 block font-normal text-[#7d3128]">{clientValidationErrors.register}</span>
                    ) : null}
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
                        ? "Enter at least the register before confirming."
                        : licenceDiskFileName
                          ? "Enter at least the register before confirming."
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
              <h2 className="text-2xl font-semibold">Who referred you to us?</h2>
              <p className="mt-2 text-sm leading-6 text-[#52615b]">
                This helps us coordinate your application and return the completed documents to the right person.
              </p>
            </div>
            <div className="grid gap-3">
              {["A friend or family member", "A dealership or motor industry professional", "Online search or social media", "Other"].map((option) => (
                <label key={option} className="flex cursor-pointer gap-3 border border-[#d8d1c3] bg-white p-3 text-sm font-semibold">
                  <input
                    type="radio"
                    name="referralChoice"
                    value={option}
                    checked={referralSource === option}
                    onChange={() => {
                      setReferralSource(option);
                      if (option !== "A dealership or motor industry professional") {
                        setSendCompletedDocumentsToReferrer(false);
                        setReferralContact("");
                      }
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
              {referralSource === "Other" ? (
                <label className="text-sm font-semibold">
                  Please tell us who referred you
                  <input
                    value={referralOther}
                    onChange={(event) => setReferralOther(event.currentTarget.value)}
                    className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    required
                  />
                </label>
              ) : null}
              {referralSource === "A dealership or motor industry professional" ? (
                <div className="border border-[#d8d1c3] bg-[#fffdf8] p-4">
                  <label className="block text-sm font-semibold">
                    Dealership or contact name
                    <input
                      value={referralContact}
                      onChange={(event) => setReferralContact(event.currentTarget.value)}
                      placeholder="Enter the name, if known"
                      className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                    />
                  </label>
                  <p className="mt-4 text-sm font-semibold">Where should we send the completed documents?</p>
                  <label className="mt-3 flex gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={sendCompletedDocumentsToReferrer}
                      onChange={(event) => setSendCompletedDocumentsToReferrer(event.currentTarget.checked)}
                    />
                    <span>Send them directly to the referring dealership or contact.</span>
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {stepIndex === 6 || stepIndex === 7 ? (
          <form action={submitPublicIntake} onSubmit={preparePublicIntakeSubmit}>
            <input type="hidden" name="serviceSlug" value={selectedService.slug} />
            <input type="hidden" name="paymentMethod" value={effectivePaymentMethod} />
            <input type="hidden" name="ownershipType" value={effectiveOwnershipType} />
            <input type="hidden" name="relation" value={relation || selectedOwnership.relationPrompt} />
            <input
              type="hidden"
              name="referralSource"
              value={referralSource === "Other" ? referralOther.trim() : referralSource}
            />
            <input type="hidden" name="referralContact" value={referralContact.trim()} />
            <input
              type="hidden"
              name="sendCompletedDocumentsToReferrer"
              value={sendCompletedDocumentsToReferrer ? "yes" : "no"}
            />
            {Object.entries(clientDetails).map(([field, value]) => (
              <input key={field} type="hidden" name={field} value={value} />
            ))}
            <input type="hidden" name="popiaConsent" value={popiaConsent ? "on" : ""} />
            <input type="hidden" name="registrationNumber" value={effectiveVehicleDetails.registrationNumber} />
            <input type="hidden" name="vin" value={effectiveVehicleDetails.vin} />
            <input type="hidden" name="vehicleMake" value={effectiveVehicleDetails.make} />
            <input type="hidden" name="vehicleModel" value={effectiveVehicleDetails.model} />
            <input type="hidden" name="deliveryRequired" value={deliveryRequired ? "yes" : "no"} />
            {Object.entries(entityDetails).map(([field, value]) => (
              <input key={field} type="hidden" name={field} value={value} />
            ))}
            <input ref={signatureInputRef} type="hidden" name="signatureDataUrl" />

            {stepIndex >= 6 ? (
              <div
                className={
                  stepIndex === 6
                    ? "grid gap-5 lg:grid-cols-[0.85fr_1.15fr]"
                    : "absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
                }
              >
                <div>
                  <h2 className="text-2xl font-semibold">Review and sign</h2>
                  <p className="mt-2 text-sm leading-6 text-[#52615b]">
                    Upload the supporting documents, then sign the populated mandate form.
                  </p>
                </div>
                <div className="grid gap-3">
                  {requiredDocuments.filter((document) => isMandateStepUpload(document.label)).map((document) => (
                    <div key={document.label} className="border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="flex items-center gap-2 font-semibold">
                          <Upload size={18} className="text-[#07315f]" aria-hidden="true" />
                          {document.label}
                        </span>
                        <label className="cursor-pointer border border-[#d8d1c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#52615b]">
                          Choose File
                          {(() => {
                            const inputName =
                              selectedService.slug === "change-of-ownership"
                                ? "supportingDocument"
                                : uploadInputName(document.label);

                            return (
                              <input
                                type="file"
                                name={inputName}
                                accept={
                                  inputName === "proofOfAddress" || inputName === "supportingDocument"
                                    ? "image/jpeg,image/png,image/heic,image/heif,application/pdf"
                                    : "image/jpeg,image/png,image/heic,image/heif"
                                }
                                required={stepIndex === 6}
                                className="sr-only"
                                onChange={(event) => {
                                  const selectedFile = event.currentTarget.files?.[0] ?? null;
                                  const fileName = selectedFile?.name;
                                  const acceptedTypes =
                                    inputName === "proofOfAddress" || inputName === "supportingDocument"
                                      ? DOCUMENT_UPLOAD_TYPES
                                      : IMAGE_UPLOAD_TYPES;

                                  if (selectedFile) {
                                    const validationError = validateSelectedUpload(selectedFile, acceptedTypes, document.label);
                                    if (validationError) {
                                      setUploadError(validationError);
                                      event.currentTarget.value = "";
                                      setUploadedFiles((current) => ({
                                        ...current,
                                        [inputName as UploadFieldName]: null,
                                      }));
                                      setSelectedFiles((current) => {
                                        const next = { ...current };
                                        delete next[document.label];
                                        return next;
                                      });
                                      return;
                                    }
                                  }

                                  setUploadError("");
                                  if (inputName === "licenceDiskPhoto") {
                                    setLicenceDiskFileName(fileName ?? "");
                                  }

                                  setUploadedFiles((current) => ({
                                    ...current,
                                    [inputName as UploadFieldName]: selectedFile,
                                  }));
                                  setSelectedFiles((current) => ({
                                    ...current,
                                    [document.label]: fileName ?? "",
                                  }));
                                }}
                              />
                            );
                          })()}
                          {selectedService.slug === "change-of-ownership" || uploadInputName(document.label) === "supportingDocument" ? (
                            <input type="hidden" name="supportingDocumentKey" value={document.key} />
                          ) : null}
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
                        Request letter for {selectedService.name}
                      </p>
                      <p className="mt-4">To Whom This May Concern</p>
                      <p className="mt-3">
                        {ownershipType === "company-or-trust" || ownershipType === "deceased-estate" ? (
                          <>
                            I, <span className="font-semibold">{clientDetails.fullName || "Client name"}</span>, acting on
                            behalf of{" "}
                            <span className="font-semibold">
                              {entityDetails.entityDisplayName ||
                                (ownershipType === "company-or-trust" ? "the company or trust" : "the deceased estate")}
                            </span>
                            {ownershipType === "deceased-estate" ? (
                              <>
                                , in respect of the late{" "}
                                <span className="font-semibold">
                                  {entityDetails.deceasedFullName || "deceased full name"}
                                </span>{" "}
                                (ID number{" "}
                                <span className="font-semibold">{entityDetails.deceasedIdNumber || "to be confirmed"}</span>)
                              </>
                            ) : null}
                            , hereby state that I require assistance with my selected The License Hub service,{" "}
                            <span className="font-semibold">{selectedService.name}</span>.
                          </>
                        ) : (
                          <>
                            I, <span className="font-semibold">{clientDetails.fullName || "Client name"}</span>, hereby
                            state that I require assistance with my selected The License Hub service,{" "}
                            <span className="font-semibold">{selectedService.name}</span>.
                          </>
                        )}
                      </p>
                      {selectedService.slug === "change-of-ownership" ? (
                        <p className="mt-3">
                          I confirm that the vehicle&apos;s license fees are fully paid up to date. I understand that if
                          any outstanding license fees exist, this may result in additional charges to renew the license
                          before the change of ownership can proceed.
                        </p>
                      ) : null}
                      <p className="mt-3">
                        I request The License Hub&apos;s assistance in preparing and submitting the required vehicle
                        administration documents on my behalf, using the details I have provided and confirmed in this
                        application.
                      </p>
                      <dl className="mt-4 grid gap-3 border-t border-[#eee8dc] pt-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Client</dt>
                          <dd className="font-medium">{clientDetails.fullName || "To be confirmed"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">
                            {effectiveOwnershipType === "non-sa-citizen" ? "Passport / TRN" : "ID number"}
                          </dt>
                          <dd className="font-medium">
                            {effectiveOwnershipType === "non-sa-citizen"
                              ? nonSaIdentityPreview || clientDetails.identityNumber || "To be confirmed"
                              : clientDetails.identityNumber || "To be confirmed"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Register</dt>
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
                        {ownershipType === "deceased-estate" ? (
                          <>
                            <div>
                              <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Deceased full name</dt>
                              <dd className="font-medium">{entityDetails.deceasedFullName || "To be confirmed"}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Deceased ID number</dt>
                              <dd className="font-medium">{entityDetails.deceasedIdNumber || "To be confirmed"}</dd>
                            </div>
                          </>
                        ) : null}
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
                        onPointerMove={(event) =>
                          drawSignatureMove(canvasPoint(event.currentTarget, event.clientX, event.clientY))
                        }
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
                          Signature required before application can be submitted.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {stepIndex === 7 ? (
              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <h2 className="text-2xl font-semibold">{isQuoteFlowService ? "Quote" : "Payment"}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#52615b]">
                    {isQuoteFlowService
                      ? "Admin will prepare the quote first. Payment opens only after you approve it."
                      : "Choose how you would like to pay, then submit your application."}
                  </p>
                  {isQuoteFlowService ? (
                    <div className="mt-4 border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                      <p className="font-semibold">Payment comes later</p>
                      <p className="mt-2 text-xs leading-5 text-[#6b5e4f]">
                        After approving the quote, you can pay by EFT
                        {paystackEnabled ? " or choose Paystack for online payment" : ""}.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 border border-[#eee8dc] bg-[#fffdf8] p-3 text-sm">
                      <p className="font-semibold">Payment method</p>
                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("EFT")}
                          className={[
                            "border px-3 py-2 text-left",
                            effectivePaymentMethod === "EFT"
                              ? "border-[#1f2724] bg-[#fff8df]"
                              : "border-[#d8d1c3] bg-white",
                          ].join(" ")}
                        >
                          <span className="block text-sm font-semibold">EFT transfer</span>
                          <span className="mt-1 block text-xs font-semibold text-[#6b5e4f]">
                            Upload proof of payment after submitting.
                          </span>
                        </button>
                        {paystackEnabled ? (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("PAYSTACK")}
                            className={[
                              "border px-3 py-2 text-left",
                              effectivePaymentMethod === "PAYSTACK"
                                ? "border-[#1f2724] bg-[#fff8df]"
                                : "border-[#d8d1c3] bg-white",
                            ].join(" ")}
                          >
                            <span className="block text-sm font-semibold">Paystack</span>
                            <span className="mt-1 block text-xs font-semibold text-[#6b5e4f]">
                              Pay by card or another Paystack-supported method.
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}

                  <label className="mt-4 flex gap-3 border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={deliveryRequired}
                      onChange={(event) => setDeliveryRequired(event.currentTarget.checked)}
                    />
                    <span>Delivery required for this application.</span>
                  </label>

                  {deliveryRequired ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[
                        {
                          name: "paymentDeliveryAddressLine1",
                          label: "Delivery address line 1",
                          required: true,
                          defaultValue: clientDetails.deliveryAddressLine1,
                        },
                        {
                          name: "paymentDeliveryAddressLine2",
                          label: "Delivery address line 2",
                          required: false,
                          defaultValue: clientDetails.deliveryAddressLine2,
                        },
                        {
                          name: "paymentDeliverySuburb",
                          label: "Delivery suburb",
                          required: false,
                          defaultValue: clientDetails.deliverySuburb,
                        },
                        {
                          name: "paymentDeliveryCity",
                          label: "Delivery city",
                          required: true,
                          defaultValue: clientDetails.deliveryCity,
                        },
                        {
                          name: "paymentDeliveryProvince",
                          label: "Delivery province",
                          required: false,
                          defaultValue: clientDetails.deliveryProvince,
                        },
                        {
                          name: "paymentDeliveryPostalCode",
                          label: "Delivery postal code",
                          required: true,
                          defaultValue: clientDetails.deliveryPostalCode,
                        },
                      ].map((field) => (
                        <label key={field.name} className="text-sm font-semibold">
                          {field.label}
                          <input
                            name={field.name}
                            required={field.required}
                            defaultValue={field.defaultValue}
                            className="mt-1 w-full border border-[#d8d1c3] px-3 py-2 font-normal"
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>

                <aside className="border border-[#d8d1c3] bg-[#fffdf8] p-4">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <CreditCard size={20} className="text-[#07315f]" aria-hidden="true" />
                    Amount due
                  </h3>
                  <p className="mt-4 text-3xl font-semibold">
                    {isQuoteFlowService
                      ? "To be confirmed"
                      : `R${(
                          selectedServiceDisplayAmount +
                          (deliveryRequired ? selectedServiceDisplayDeliveryFee : 0)
                        ).toFixed(2)}`}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#6b5e4f]">{selectedService.name}</p>
                  {!isQuoteFlowService && deliveryRequired ? (
                    <p className="mt-2 text-xs font-semibold text-[#6b5e4f]">
                      Includes delivery fee: R{selectedServiceDisplayDeliveryFee.toFixed(2)}
                    </p>
                  ) : null}
                  <p className="mt-4 text-sm leading-6 text-[#6b5e4f]">
                    {isQuoteFlowService
                      ? "The application will be submitted for admin quote preparation when you submit."
                      : "The application will be submitted and payment instructions will open when you submit."}
                  </p>
                {!requiredUploadsReady ? (
                  <p className="mt-3 border border-[#d8b267] bg-[#fff8df] p-3 text-xs font-semibold text-[#6b5e4f]">
                    Complete all required uploads in the Mandate Form step before submission.
                  </p>
                ) : null}
                {step6ProceedBlocked ? (
                  <p className="mt-3 border border-[#b35448] bg-[#fff5f3] p-3 text-xs font-semibold text-[#7d3128]">
                    Complete all required uploads and add your signature before continuing.
                  </p>
                ) : null}
                {!clientDetailsComplete ? (
                  <p className="mt-3 border border-[#d8b267] bg-[#fff8df] p-3 text-xs font-semibold text-[#6b5e4f]">
                    Complete required identity details in the Who You Are step before final submission.
                  </p>
                ) : null}
                  {publicIntakeSubmitState.status === "error" ? (
                    <p className="mt-3 border border-[#b35448] bg-[#fff5f3] p-3 text-xs font-semibold text-[#7d3128]">
                      {publicIntakeSubmitState.message}
                    </p>
                  ) : null}
                  <SubmitApplicationButton quoteFlow={isQuoteFlowService} disabled={!clientDetailsComplete} />
                </aside>
              </div>
            ) : null}
          </form>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-[#eee8dc] pt-5">
          <button
            type="button"
            onClick={previousStep}
            disabled={stepIndex === 0}
            className={[
              "inline-flex items-center gap-2 border px-4 py-2 text-sm font-black uppercase tracking-wide",
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
              (stepIndex === 2 && !ownershipType) ||
              (stepIndex === 3 && !clientDetailsComplete) ||
              (stepIndex === 4 && (!vehicleDetailsConfirmed || !vehicleDetailsComplete)) ||
              (stepIndex === 5 && (!referralSource || (referralSource === "Other" && !referralOther.trim()))) ||
              (stepIndex === 6 && (!hasMandateSignature || !requiredUploadsReady))
            }
            aria-describedby={
              step3ProceedBlocked || step6ProceedBlocked ? "step-proceed-error" : undefined
            }
            className={[
              "inline-flex items-center gap-2 border px-4 py-2 text-sm font-black uppercase tracking-wide",
              stepIndex === steps.length - 1 ||
              (stepIndex === 2 && !ownershipType) ||
              (stepIndex === 3 && !clientDetailsComplete) ||
              (stepIndex === 4 && (!vehicleDetailsConfirmed || !vehicleDetailsComplete)) ||
              (stepIndex === 5 && (!referralSource || (referralSource === "Other" && !referralOther.trim()))) ||
              (stepIndex === 6 && (!hasMandateSignature || !requiredUploadsReady))
                ? "cursor-not-allowed border-[#e4ded2] bg-[#e8e2d6] text-[#6b5e4f]"
                : "tlh-button-primary",
            ].join(" ")}
          >
            Proceed
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        {stepIndex === 3 && step3ProceedAttempted && step3ProceedBlocked ? (
          <p id="step-proceed-error" className="mt-3 text-sm font-semibold text-[#7d3128]">
            Complete the required details on this step before continuing.
          </p>
        ) : null}
        {stepIndex === 6 && step6ProceedAttempted && step6ProceedBlocked ? (
          <p id="step-proceed-error" className="mt-3 text-sm font-semibold text-[#7d3128]">
            Complete all required uploads and add your signature before continuing.
          </p>
        ) : null}
      </div>
    </section>
  );
}

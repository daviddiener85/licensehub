"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Calendar, CheckCircle2, FileText, IdCard, RotateCcw, Send, Upload } from "lucide-react";

import {
  resubmitMandateSignature,
  resubmitSupportingDocuments,
  submitMandateFormCapture,
} from "@/lib/workflow-actions";

type MandateCaptureFormProps = {
  applicationId: string;
  clientName: string;
  registrationNumber: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  colour: string | null;
  submittedAt?: Date | null;
  idPhotoFileName?: string | null;
};

type Point = {
  x: number;
  y: number;
};

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function fieldValue(value: string | null) {
  return value?.trim() || "To be confirmed";
}

function isProofDateTooOld(value: string) {
  if (!value) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return true;
  }

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  return date < threeMonthsAgo;
}

function createImagePreview(file: File | undefined) {
  if (!file || !file.type.startsWith("image/")) {
    return "";
  }

  return URL.createObjectURL(file);
}

function formatSubmittedDate(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function SubmittedSection({
  title,
  submittedAt,
  children,
}: {
  title: string;
  submittedAt: Date;
  children: ReactNode;
}) {
  return (
    <details className="border border-[#c5b89e] bg-white">
      <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <h3 className="text-base font-semibold sm:text-lg">{title}</h3>
        <span className="inline-flex w-fit items-center gap-2 border border-[#1f7a4d] bg-[#f4fbf7] px-3 py-1.5 text-sm font-semibold text-[#1f7a4d]">
          <CheckCircle2 size={16} aria-hidden="true" />
          Submitted {formatSubmittedDate(submittedAt)}
        </span>
      </summary>
      <div className="border-t border-[#eee8dc] px-4 py-4 sm:px-6">{children}</div>
    </details>
  );
}

export function MandateCaptureForm({
  applicationId,
  clientName,
  registrationNumber,
  vin,
  make,
  model,
  colour,
  submittedAt,
}: MandateCaptureFormProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [idFileName, setIdFileName] = useState("");
  const [licenceFileName, setLicenceFileName] = useState("");
  const [proofFileName, setProofFileName] = useState("");
  const [idPhotoPreviewUrl, setIdPhotoPreviewUrl] = useState("");
  const [licencePreviewUrl, setLicencePreviewUrl] = useState("");
  const [proofPreviewUrl, setProofPreviewUrl] = useState("");
  const [proofDocumentDate, setProofDocumentDate] = useState("");
  const proofDateTooOld = isProofDateTooOld(proofDocumentDate);
  const canSubmitDocuments = Boolean(idFileName && licenceFileName && proofFileName && proofDocumentDate && !proofDateTooOld);
  const canSubmit = Boolean(idFileName && licenceFileName && proofFileName && proofDocumentDate && !proofDateTooOld && hasSignature);

  useEffect(() => {
    return () => {
      if (idPhotoPreviewUrl) {
        URL.revokeObjectURL(idPhotoPreviewUrl);
      }

      if (licencePreviewUrl) {
        URL.revokeObjectURL(licencePreviewUrl);
      }

      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
    };
  }, [idPhotoPreviewUrl, licencePreviewUrl, proofPreviewUrl]);

  function drawStart(point: Point) {
    const canvas = canvasRef.current;
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
    setIsDrawing(true);
    setHasSignature(true);
  }

  function drawMove(point: Point) {
    if (!isDrawing) {
      return;
    }

    const context = canvasRef.current?.getContext("2d");

    if (!context) {
      return;
    }

    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);

    if (signatureInputRef.current) {
      signatureInputRef.current.value = "";
    }
  }

  function prepareSubmit(event: FormEvent<HTMLFormElement>) {
    const canvas = canvasRef.current;

    if (!canvas || !signatureInputRef.current || !canSubmit) {
      event.preventDefault();
      return;
    }

    signatureInputRef.current.value = canvas.toDataURL("image/png");
  }

  function prepareSignatureResubmit(event: FormEvent<HTMLFormElement>) {
    const canvas = canvasRef.current;

    if (!canvas || !signatureInputRef.current || !hasSignature) {
      event.preventDefault();
      return;
    }

    signatureInputRef.current.value = canvas.toDataURL("image/png");
  }

  function updateIdPhoto(file: File | undefined) {
    if (idPhotoPreviewUrl) {
      URL.revokeObjectURL(idPhotoPreviewUrl);
    }

    setIdFileName(file?.name ?? "");
    setIdPhotoPreviewUrl(createImagePreview(file));
  }

  function updateLicencePhoto(file: File | undefined) {
    if (licencePreviewUrl) {
      URL.revokeObjectURL(licencePreviewUrl);
    }

    setLicenceFileName(file?.name ?? "");
    setLicencePreviewUrl(createImagePreview(file));
  }

  function updateProofOfAddress(file: File | undefined) {
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
    }

    setProofFileName(file?.name ?? "");
    setProofPreviewUrl(createImagePreview(file));
  }

  if (submittedAt) {
    return (
      <div className="space-y-3">
        <SubmittedSection title="1. Upload required documents" submittedAt={submittedAt}>
          <form action={resubmitSupportingDocuments} className="space-y-4">
            <input type="hidden" name="applicationId" value={applicationId} />
            <p className="text-sm leading-6 text-[#52615b]">
              Replace the uploaded documents below. Submitting replaces the files already linked to this application.
            </p>

            <div className="grid gap-3">
              <div className="border border-[#d8d1c3] bg-white p-3">
                <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="idPhotoResubmit">
                  <IdCard size={18} className="text-[#07315f]" aria-hidden="true" />
                  ID photo
                </label>
                <label
                  htmlFor="idPhotoResubmit"
                  className="mt-2 flex min-h-24 cursor-pointer items-center justify-center border border-dashed border-[#8a6a2a] bg-[#fffdf8] p-3 text-center text-sm text-[#52615b]"
                >
                  {idPhotoPreviewUrl ? (
                    <span
                      aria-label="Selected ID photo preview"
                      className="block h-36 w-full bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${idPhotoPreviewUrl})` }}
                    />
                  ) : idFileName ? (
                    <span className="flex flex-col items-center justify-center text-[#1f7a4d]">
                      <CheckCircle2 size={28} className="mb-2" aria-hidden="true" />
                      <span className="font-semibold">{idFileName}</span>
                    </span>
                  ) : (
                    <span className="flex flex-col items-center justify-center">
                      <Upload size={24} className="mb-2 text-[#07315f]" aria-hidden="true" />
                      <span className="font-semibold text-[#1f2724]">Add ID photo</span>
                    </span>
                  )}
                </label>
                <input
                  id="idPhotoResubmit"
                  name="idPhoto"
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  required
                  className="sr-only"
                  onChange={(event) => updateIdPhoto(event.currentTarget.files?.[0])}
                />
              </div>

              <div className="border border-[#d8d1c3] bg-white p-3">
                <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="licenceDiskPhotoResubmit">
                  <FileText size={18} className="text-[#07315f]" aria-hidden="true" />
                  Licence disk photo
                </label>
                <label
                  htmlFor="licenceDiskPhotoResubmit"
                  className="mt-2 flex min-h-24 cursor-pointer flex-col items-center justify-center border border-dashed border-[#8a6a2a] bg-[#fffdf8] p-3 text-center text-sm text-[#52615b]"
                >
                  {licencePreviewUrl ? (
                    <span
                      aria-label="Selected licence disk photo preview"
                      className="block h-36 w-full bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${licencePreviewUrl})` }}
                    />
                  ) : licenceFileName ? (
                    <span className="flex flex-col items-center justify-center text-[#1f7a4d]">
                      <CheckCircle2 size={28} className="mb-2" aria-hidden="true" />
                      <span className="font-semibold">{licenceFileName}</span>
                    </span>
                  ) : (
                    <>
                      <Upload size={24} className="mb-2 text-[#07315f]" aria-hidden="true" />
                      <span className="font-semibold text-[#1f2724]">Add licence disk photo</span>
                    </>
                  )}
                </label>
                <input
                  id="licenceDiskPhotoResubmit"
                  name="licenceDiskPhoto"
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  required
                  className="sr-only"
                  onChange={(event) => updateLicencePhoto(event.currentTarget.files?.[0])}
                />
              </div>

              <div className="border border-[#d8d1c3] bg-white p-3">
                <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="proofOfAddressResubmit">
                  <FileText size={18} className="text-[#07315f]" aria-hidden="true" />
                  Proof of address
                </label>
                <label
                  htmlFor="proofOfAddressResubmit"
                  className="mt-2 flex min-h-24 cursor-pointer flex-col items-center justify-center border border-dashed border-[#8a6a2a] bg-[#fffdf8] p-3 text-center text-sm text-[#52615b]"
                >
                  {proofPreviewUrl ? (
                    <span
                      aria-label="Selected proof of address preview"
                      className="block h-36 w-full bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url(${proofPreviewUrl})` }}
                    />
                  ) : proofFileName ? (
                    <span className="flex flex-col items-center justify-center text-[#1f7a4d]">
                      <CheckCircle2 size={28} className="mb-2" aria-hidden="true" />
                      <span className="font-semibold">{proofFileName}</span>
                    </span>
                  ) : (
                    <>
                      <Upload size={24} className="mb-2 text-[#07315f]" aria-hidden="true" />
                      <span className="font-semibold text-[#1f2724]">Add proof of address</span>
                    </>
                  )}
                </label>
                <input
                  id="proofOfAddressResubmit"
                  name="proofOfAddress"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  required
                  className="sr-only"
                  onChange={(event) => updateProofOfAddress(event.currentTarget.files?.[0])}
                />
                <label
                  className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#6b5e4f]"
                  htmlFor="proofDocumentDateResubmit"
                >
                  <Calendar size={15} aria-hidden="true" />
                  Document date
                </label>
                <input
                  id="proofDocumentDateResubmit"
                  name="proofDocumentDate"
                  type="date"
                  required
                  aria-invalid={proofDateTooOld}
                  className={[
                    "mt-1 w-full border bg-white px-3 py-2 text-sm",
                    proofDateTooOld ? "border-[#b3261e]" : "border-[#d8d1c3]",
                  ].join(" ")}
                  value={proofDocumentDate}
                  onChange={(event) => setProofDocumentDate(event.currentTarget.value)}
                />
                {proofDateTooOld ? (
                  <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#b3261e]">
                    <AlertCircle size={15} aria-hidden="true" />
                    Proof of address is more than 3 months old. Please upload a newer document.
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmitDocuments}
              className={[
                "inline-flex w-full items-center justify-center gap-2 border px-4 py-3 text-sm font-semibold sm:w-auto",
                canSubmitDocuments
                  ? "border-[#1f2724] bg-[#1f2724] text-white"
                  : "cursor-not-allowed border-[#d8d1c3] bg-[#e8e2d6] text-[#6b5e4f]",
              ].join(" ")}
            >
              <Send size={16} aria-hidden="true" />
              Resubmit Documents
            </button>
          </form>
        </SubmittedSection>

        <SubmittedSection title="2. Complete mandate form" submittedAt={submittedAt}>
          <form action={resubmitMandateSignature} onSubmit={prepareSignatureResubmit} className="space-y-4">
            <input type="hidden" name="applicationId" value={applicationId} />
            <input ref={signatureInputRef} type="hidden" name="signatureDataUrl" />
            <p className="text-sm leading-6 text-[#52615b]">
              Replace the mandate signature below. Submitting regenerates the mandate form for review.
            </p>

            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-semibold" htmlFor="signature-pad-resubmit">
                Signature
              </label>
              <button
                type="button"
                onClick={clearSignature}
                className="inline-flex items-center gap-2 border border-[#d8d1c3] px-3 py-1.5 text-xs font-semibold text-[#6b5e4f]"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Clear
              </button>
            </div>
            <canvas
              ref={canvasRef}
              id="signature-pad-resubmit"
              width={900}
              height={420}
              className="h-72 w-full touch-none border-2 border-[#07315f] bg-white sm:h-80 lg:h-96"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                drawStart(canvasPoint(event.currentTarget, event.clientX, event.clientY));
              }}
              onPointerMove={(event) => drawMove(canvasPoint(event.currentTarget, event.clientX, event.clientY))}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerLeave={stopDrawing}
              aria-label="Signature pad"
            />
            {!hasSignature ? <p className="text-xs text-[#8a6a2a]">Signature required before submit.</p> : null}

            <button
              type="submit"
              disabled={!hasSignature}
              className={[
                "inline-flex w-full items-center justify-center gap-2 border px-4 py-3 text-sm font-semibold sm:w-auto",
                hasSignature
                  ? "border-[#1f2724] bg-[#1f2724] text-white"
                  : "cursor-not-allowed border-[#d8d1c3] bg-[#e8e2d6] text-[#6b5e4f]",
              ].join(" ")}
            >
              <Send size={16} aria-hidden="true" />
              Resubmit Mandate Form
            </button>
          </form>
        </SubmittedSection>
      </div>
    );
  }

  return (
    <form
      action={submitMandateFormCapture}
      onSubmit={prepareSubmit}
      className="border border-[#c5b89e] bg-[#fffdf8] p-4 sm:p-5"
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <input ref={signatureInputRef} type="hidden" name="signatureDataUrl" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-base font-semibold">1. Upload required documents</h3>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="border border-[#d8d1c3] bg-white p-3">
          <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="idPhoto">
            <IdCard size={18} className="text-[#07315f]" aria-hidden="true" />
            ID photo
          </label>
          <label
            htmlFor="idPhoto"
            className="mt-2 flex min-h-32 cursor-pointer items-center justify-center border border-dashed border-[#8a6a2a] bg-[#fffdf8] p-3 text-center text-sm text-[#52615b]"
          >
            {idPhotoPreviewUrl ? (
              <span
                aria-label="Selected ID photo preview"
                className="block h-44 w-full bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${idPhotoPreviewUrl})` }}
              />
            ) : idFileName ? (
              <span className="flex flex-col items-center justify-center text-[#1f7a4d]">
                <CheckCircle2 size={30} className="mb-2" aria-hidden="true" />
                <span className="font-semibold">{idFileName}</span>
                <span className="mt-1 text-xs text-[#52615b]">Uploaded</span>
              </span>
            ) : (
              <span className="flex flex-col items-center justify-center">
                <Upload size={28} className="mb-2 text-[#07315f]" aria-hidden="true" />
                <span className="font-semibold text-[#1f2724]">{idFileName || "Add ID photo"}</span>
                <span className="mt-1 text-xs">Use the camera on mobile. JPG or PNG.</span>
              </span>
            )}
          </label>
          <input
            id="idPhoto"
            name="idPhoto"
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            required
            className="sr-only"
            onChange={(event) => updateIdPhoto(event.currentTarget.files?.[0])}
          />
        </div>

        <div className="border border-[#d8d1c3] bg-white p-3">
          <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="licenceDiskPhoto">
            <FileText size={18} className="text-[#07315f]" aria-hidden="true" />
            Licence disk photo
          </label>
          <label
            htmlFor="licenceDiskPhoto"
            className="mt-2 flex min-h-24 cursor-pointer flex-col items-center justify-center border border-dashed border-[#8a6a2a] bg-[#fffdf8] p-3 text-center text-sm text-[#52615b]"
          >
            {licencePreviewUrl ? (
              <span
                aria-label="Selected licence disk photo preview"
                className="block h-36 w-full bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${licencePreviewUrl})` }}
              />
            ) : licenceFileName ? (
              <span className="flex flex-col items-center justify-center text-[#1f7a4d]">
                <CheckCircle2 size={28} className="mb-2" aria-hidden="true" />
                <span className="font-semibold">{licenceFileName}</span>
                <span className="mt-1 text-xs text-[#52615b]">Uploaded</span>
              </span>
            ) : (
              <>
                <Upload size={24} className="mb-2 text-[#07315f]" aria-hidden="true" />
                <span className="font-semibold text-[#1f2724]">Add licence disk photo</span>
                <span className="mt-1 text-xs">JPG or PNG.</span>
              </>
            )}
          </label>
          <input
            id="licenceDiskPhoto"
            name="licenceDiskPhoto"
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            required
            className="sr-only"
            onChange={(event) => updateLicencePhoto(event.currentTarget.files?.[0])}
          />
        </div>

        <div className="border border-[#d8d1c3] bg-white p-3">
          <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="proofOfAddress">
            <FileText size={18} className="text-[#07315f]" aria-hidden="true" />
            Proof of address
          </label>
          <label
            htmlFor="proofOfAddress"
            className="mt-2 flex min-h-24 cursor-pointer flex-col items-center justify-center border border-dashed border-[#8a6a2a] bg-[#fffdf8] p-3 text-center text-sm text-[#52615b]"
          >
            {proofPreviewUrl ? (
              <span
                aria-label="Selected proof of address preview"
                className="block h-36 w-full bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${proofPreviewUrl})` }}
              />
            ) : proofFileName ? (
              <span className="flex flex-col items-center justify-center text-[#1f7a4d]">
                <CheckCircle2 size={28} className="mb-2" aria-hidden="true" />
                <span className="font-semibold">{proofFileName}</span>
                <span className="mt-1 text-xs text-[#52615b]">Uploaded</span>
              </span>
            ) : (
              <>
                <Upload size={24} className="mb-2 text-[#07315f]" aria-hidden="true" />
                <span className="font-semibold text-[#1f2724]">Add proof of address</span>
                <span className="mt-1 text-xs">JPG, PNG, or PDF. Must be dated within the last 3 months.</span>
              </>
            )}
          </label>
          <input
            id="proofOfAddress"
            name="proofOfAddress"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            required
            className="sr-only"
            onChange={(event) => updateProofOfAddress(event.currentTarget.files?.[0])}
          />
          <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#6b5e4f]" htmlFor="proofDocumentDate">
            <Calendar size={15} aria-hidden="true" />
            Document date
          </label>
          <input
            id="proofDocumentDate"
            name="proofDocumentDate"
            type="date"
            required
            aria-invalid={proofDateTooOld}
            className={[
              "mt-1 w-full border bg-white px-3 py-2 text-sm",
              proofDateTooOld ? "border-[#b3261e]" : "border-[#d8d1c3]",
            ].join(" ")}
            value={proofDocumentDate}
            onChange={(event) => setProofDocumentDate(event.currentTarget.value)}
          />
          {proofDateTooOld ? (
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#b3261e]">
              <AlertCircle size={15} aria-hidden="true" />
              Proof of address is more than 3 months old. Please upload a newer document.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 border-t border-[#d8d1c3] pt-5">
        <h3 className="text-base font-semibold">2. Complete mandate form</h3>
        <p className="mt-1 text-sm leading-6 text-[#52615b]">
          Review the mandate details and sign below. The completed mandate form will be sent to License Hub for review.
        </p>

        <div className="mt-4 border border-[#d8d1c3] bg-white p-4 text-sm leading-6">
          <p className="font-semibold">Request letter for duplicate vehicle registration document</p>
          <p className="mt-3">
            I, <span className="font-semibold">{clientName}</span>, hereby state that I have lost my vehicle&apos;s
            registration document and request License Hub&apos;s assistance in obtaining a duplicate vehicle registration
            document on my behalf.
          </p>
          <dl className="mt-4 grid gap-3 border-t border-[#eee8dc] pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Registration</dt>
              <dd className="font-medium">{fieldValue(registrationNumber)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">VIN</dt>
              <dd className="font-medium">{fieldValue(vin)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Make</dt>
              <dd className="font-medium">{fieldValue(make)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Model</dt>
              <dd className="font-medium">{fieldValue(model)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-[#6b5e4f]">Colour</dt>
              <dd className="font-medium">{fieldValue(colour)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold" htmlFor="signature-pad">
              Signature
            </label>
            <button
              type="button"
              onClick={clearSignature}
              className="inline-flex items-center gap-2 border border-[#d8d1c3] px-3 py-1.5 text-xs font-semibold text-[#6b5e4f]"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Clear
            </button>
          </div>
          <canvas
            ref={canvasRef}
            id="signature-pad"
            width={900}
            height={420}
            className="mt-2 h-72 w-full touch-none border-2 border-[#07315f] bg-white sm:h-80 lg:h-96"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drawStart(canvasPoint(event.currentTarget, event.clientX, event.clientY));
            }}
            onPointerMove={(event) => drawMove(canvasPoint(event.currentTarget, event.clientX, event.clientY))}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
            aria-label="Signature pad"
          />
          <p className="mt-2 text-xs leading-5 text-[#6b5e4f]">
            Use your finger and sign inside the full box. Turn the phone sideways if you need more room.
          </p>
          {!hasSignature ? <p className="mt-1 text-xs text-[#8a6a2a]">Signature required before submit.</p> : null}
        </div>
      </div>

      <div className="mt-5">
        {!canSubmit ? (
          <p className="mb-3 text-xs font-semibold text-[#8a6a2a]">
            Complete all uploads, enter a valid proof-of-address date, and sign before submitting.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            "inline-flex w-full items-center justify-center gap-2 border px-4 py-3 text-sm font-semibold sm:w-auto",
            canSubmit
              ? "border-[#1f2724] bg-[#1f2724] text-white"
              : "cursor-not-allowed border-[#d8d1c3] bg-[#e8e2d6] text-[#6b5e4f]",
          ].join(" ")}
        >
          <Send size={16} aria-hidden="true" />
          Submit Capture
        </button>
      </div>
    </form>
  );
}

"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { RotateCcw, Send, Upload } from "lucide-react";

import { submitMandateFormCapture } from "@/lib/workflow-actions";

type MandateCaptureFormProps = {
  applicationId: string;
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

export function MandateCaptureForm({ applicationId, submittedAt, idPhotoFileName }: MandateCaptureFormProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [fileName, setFileName] = useState(idPhotoFileName ?? "");

  function drawStart(point: Point) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.strokeStyle = "#111827";
    context.lineWidth = 3;
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

    if (!canvas || !signatureInputRef.current || !hasSignature) {
      event.preventDefault();
      return;
    }

    signatureInputRef.current.value = canvas.toDataURL("image/png");
  }

  return (
    <form action={submitMandateFormCapture} onSubmit={prepareSubmit} className="border border-[#c5b89e] bg-[#fffdf8] p-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input ref={signatureInputRef} type="hidden" name="signatureDataUrl" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Mandate Form Capture</h3>
          <p className="mt-1 text-sm leading-6 text-[#52615b]">
            Sign on the pad, upload a clear photo of the ID placed on the mandate form, then submit for PDF generation.
          </p>
        </div>
        {submittedAt ? (
          <span className="border border-[#1f7a4d] px-2 py-1 text-xs font-semibold text-[#1f7a4d]">
            Submitted {submittedAt.toLocaleDateString("en-ZA")}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold" htmlFor="signature-pad">
              Client signature
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
            width={720}
            height={220}
            className="mt-2 h-44 w-full touch-none border border-[#d8d1c3] bg-white"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drawStart(canvasPoint(event.currentTarget, event.clientX, event.clientY));
            }}
            onPointerMove={(event) => drawMove(canvasPoint(event.currentTarget, event.clientX, event.clientY))}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            aria-label="Client signature pad"
          />
          {!hasSignature ? <p className="mt-2 text-xs text-[#8a6a2a]">Signature required before submit.</p> : null}
        </div>

        <div>
          <label className="text-sm font-semibold" htmlFor="idPhoto">
            ID photo on mandate form
          </label>
          <label
            htmlFor="idPhoto"
            className="mt-2 flex min-h-44 cursor-pointer flex-col items-center justify-center border border-dashed border-[#8a6a2a] bg-white px-4 py-6 text-center text-sm text-[#52615b]"
          >
            <Upload size={28} className="mb-3 text-[#07315f]" aria-hidden="true" />
            <span className="font-semibold text-[#1f2724]">{fileName || "Upload ID photo"}</span>
            <span className="mt-1 text-xs">JPG or PNG. Make sure the full page is visible.</span>
          </label>
          <input
            id="idPhoto"
            name="idPhoto"
            type="file"
            accept="image/jpeg,image/png"
            required
            className="sr-only"
            onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-2 border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white"
        >
          <Send size={16} aria-hidden="true" />
          Submit Capture
        </button>
      </div>
    </form>
  );
}

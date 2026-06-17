"use client";

import { useMemo, useRef, useState } from "react";

type AdminDocumentQuickViewProps = {
  href: string;
  fileName: string;
};

function extensionFromPath(path: string) {
  const cleanPath = path.split("?")[0] ?? path;
  return cleanPath.split(".").pop()?.toLowerCase() ?? "";
}

export function AdminDocumentQuickView({ href, fileName }: AdminDocumentQuickViewProps) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ active: boolean; startDistance: number; startScale: number }>({
    active: false,
    startDistance: 0,
    startScale: 1,
  });
  const extension = useMemo(() => extensionFromPath(href), [href]);
  const isImage = ["jpg", "jpeg", "png", "webp", "gif"].includes(extension);
  const minScale = 1;
  const maxScale = 5;

  function clampScale(value: number) {
    return Math.min(maxScale, Math.max(minScale, value));
  }

  function closeModal() {
    setOpen(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    pointersRef.current.clear();
    pinchStateRef.current = { active: false, startDistance: 0, startScale: 1 };
    dragStateRef.current = { active: false, startX: 0, startY: 0, originX: 0, originY: 0 };
  }

  function zoomBy(delta: number) {
    setScale((current) => clampScale(current + delta));
  }

  function resetView() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setIsInteracting(false);
  }

  async function requestFullscreenPreview() {
    if (!previewRef.current) {
      return;
    }

    try {
      await previewRef.current.requestFullscreen();
    } catch {
      // Best effort; preview remains open in modal if fullscreen is blocked.
    }
  }

  function onWheelZoom(event: React.WheelEvent<HTMLDivElement>) {
    if (!isImage) {
      return;
    }

    event.preventDefault();
    const step = event.deltaY < 0 ? 0.2 : -0.2;
    setScale((current) => clampScale(current + step));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isImage) {
      return;
    }

    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);

    if (pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      const startDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchStateRef.current = {
        active: true,
        startDistance,
        startScale: scale,
      };
      setIsInteracting(true);
      dragStateRef.current.active = false;
      return;
    }

    if (scale <= 1) {
      return;
    }

    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setIsInteracting(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isImage) {
      return;
    }

    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinchStateRef.current.active && pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchStateRef.current.startDistance > 0) {
        const nextScale = clampScale(
          pinchStateRef.current.startScale * (distance / pinchStateRef.current.startDistance),
        );
        setScale(nextScale);
      }
      return;
    }

    if (!dragStateRef.current.active || scale <= 1) {
      return;
    }

    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;
    setOffset({
      x: dragStateRef.current.originX + dx,
      y: dragStateRef.current.originY + dy,
    });
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!isImage) {
      return;
    }

    pointersRef.current.delete(event.pointerId);
    dragStateRef.current.active = false;

    if (pointersRef.current.size < 2) {
      pinchStateRef.current.active = false;
    }

    if (pointersRef.current.size === 0) {
      setIsInteracting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 block text-left text-xs font-semibold text-[#07315f] underline"
      >
        Open document
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Quick view: ${fileName}`}
        >
          <div className="w-full max-w-5xl border border-[#d8d1c3] bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-[#eee8dc] px-4 py-3">
              <p className="truncate text-sm font-semibold text-[#1f2724]">{fileName}</p>
              <div className="flex gap-2">
                {isImage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => zoomBy(-0.2)}
                      className="border border-[#d8d1c3] px-3 py-1.5 text-xs font-semibold text-[#52615b]"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() => zoomBy(0.2)}
                      className="border border-[#d8d1c3] px-3 py-1.5 text-xs font-semibold text-[#52615b]"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={resetView}
                      className="border border-[#d8d1c3] px-3 py-1.5 text-xs font-semibold text-[#52615b]"
                    >
                      Reset
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={requestFullscreenPreview}
                  className="border border-[#d8d1c3] px-3 py-1.5 text-xs font-semibold text-[#52615b]"
                >
                  Full screen
                </button>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-[#d8d1c3] px-3 py-1.5 text-xs font-semibold text-[#52615b]"
                >
                  Open original
                </a>
                <button
                  type="button"
                  onClick={closeModal}
                  className="border border-[#1f2724] bg-[#1f2724] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div ref={previewRef} className="bg-[#f7f5ef] p-3">
              {isImage ? (
                <div
                  ref={viewportRef}
                  className="relative h-[75vh] overflow-hidden border border-[#d8d1c3] bg-white"
                  onWheel={onWheelZoom}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onPointerLeave={onPointerUp}
                  style={{ touchAction: "none" }}
                >
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={{
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                      transformOrigin: "center center",
                      transition: isInteracting ? "none" : "transform 120ms ease-out",
                      cursor: scale > 1 ? (isInteracting ? "grabbing" : "grab") : "default",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Admin previews need raw uploaded files, not optimizer URLs. */}
                    <img
                      src={href}
                      alt={fileName}
                      className="h-auto max-h-[72vh] w-auto max-w-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <object
                  data={href}
                  type="application/pdf"
                  aria-label={fileName}
                  className="h-[75vh] w-full border border-[#d8d1c3] bg-white"
                >
                  <div className="flex h-[75vh] items-center justify-center border border-[#d8d1c3] bg-white px-6 text-center text-sm text-[#52615b]">
                    <div className="max-w-md">
                      <p className="font-semibold text-[#1f2724]">This file can’t be previewed here.</p>
                      <p className="mt-2">
                        Use Open original to view or download the document in a separate tab.
                      </p>
                    </div>
                  </div>
                </object>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

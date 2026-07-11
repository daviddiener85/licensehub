"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type WhatsAppTemplate = {
  key: string;
  label: string;
  body: string;
};

type AdminWhatsappComposerProps = {
  action: (previousState: { status: string; message: string; sentAt: number } | null, formData: FormData) => Promise<{
    status: string;
    message: string;
    sentAt: number;
  }>;
  applicationId: string;
  clientFirstName: string;
  trackingUrl: string;
  templates: ReadonlyArray<WhatsAppTemplate>;
  replyWindowState: "free_reply" | "template_required";
  lastInboundAt?: string | null;
};

function fillTemplate(body: string, clientFirstName: string, applicationId: string, trackingUrl: string) {
  return body
    .replaceAll("{{firstName}}", clientFirstName)
    .replaceAll("{{applicationId}}", applicationId)
    .replaceAll("{{trackingUrl}}", trackingUrl);
}

function WhatsAppSubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = Boolean(disabled) || pending;

  return (
    <button
      className="inline-flex items-center justify-center gap-2 border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-wait disabled:opacity-80"
      disabled={isDisabled}
      type="submit"
    >
      <span
        className={[
          "h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent",
          pending ? "animate-spin" : "opacity-0",
        ].join(" ")}
        aria-hidden="true"
      />
      {pending ? "Sending..." : "Send WhatsApp"}
    </button>
  );
}

export function AdminWhatsappComposer({
  action,
  applicationId,
  clientFirstName,
  trackingUrl,
  templates,
  replyWindowState,
  lastInboundAt,
}: AdminWhatsappComposerProps) {
  const [sendState, formAction] = useActionState(action, { status: "idle", message: "", sentAt: 0 });

  return (
    <AdminWhatsappComposerBody
      key={sendState.sentAt}
      action={formAction}
      applicationId={applicationId}
      clientFirstName={clientFirstName}
      trackingUrl={trackingUrl}
      templates={templates}
      replyWindowState={replyWindowState}
      lastInboundAt={lastInboundAt}
      resetKey={sendState.sentAt}
    />
  );
}

function AdminWhatsappComposerBody({
  action,
  applicationId,
  clientFirstName,
  trackingUrl,
  templates,
  replyWindowState,
  lastInboundAt,
  resetKey,
}: {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
  clientFirstName: string;
  trackingUrl: string;
  templates: ReadonlyArray<WhatsAppTemplate>;
  replyWindowState: "free_reply" | "template_required";
  lastInboundAt?: string | null;
  resetKey: number;
}) {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(() => (resetKey > 0 ? "" : templates[0]?.key ?? ""));
  const [body, setBody] = useState(() =>
    resetKey > 0 ? "" : fillTemplate(templates[0]?.body ?? "", clientFirstName, applicationId, trackingUrl),
  );
  const canSend = body.trim().length > 0;

  const templateButtons = useMemo(
    () =>
      templates.map((template) => ({
        ...template,
        body: fillTemplate(template.body, clientFirstName, applicationId, trackingUrl),
      })),
    [applicationId, clientFirstName, templates, trackingUrl],
  );

  return (
    <form action={action}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="templateKey" value={selectedTemplateKey} />

      <div
        className={[
          "mt-4 border px-3 py-2 text-xs font-medium",
          replyWindowState === "free_reply"
            ? "border-[#c7e4d2] bg-[#eef9f1] text-[#1f7a4d]"
            : "border-[#e5d8b8] bg-[#fff8df] text-[#8a6a2a]",
        ].join(" ")}
      >
        {replyWindowState === "free_reply" ? (
          <span>Free reply available. You can send a normal WhatsApp message.</span>
        ) : (
          <span>Template required. Use an approved WhatsApp template before sending.</span>
        )}
        {lastInboundAt ? (
          <span className="ml-2 text-[11px] opacity-80">
            Last client reply: {new Date(lastInboundAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {templateButtons.map((template) => (
          <button
            key={template.key}
            type="button"
            className="border border-[#d8d1c3] px-3 py-2 text-left text-sm font-medium"
            onClick={() => {
              setSelectedTemplateKey(template.key);
              setBody(template.body);
            }}
          >
            {template.label}
          </button>
        ))}
      </div>

      <textarea
        className="mt-4 h-24 w-full border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm outline-none"
        name="body"
        onChange={(event) => {
          setSelectedTemplateKey("");
          setBody(event.target.value);
        }}
        required
        value={body}
      />
      {replyWindowState === "template_required" ? (
        <p className="mt-2 text-xs text-[#8a6a2a]">
          This conversation is outside the 24-hour customer service window. Keep the message aligned with an approved template.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#6b5e4f]">Messages are stored against the application audit record.</p>
        <WhatsAppSubmitButton disabled={!canSend} />
      </div>
      {!canSend ? <p className="mt-2 text-xs text-[#8a6a2a]">Type a message before sending.</p> : null}
    </form>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type WhatsAppTemplate = {
  key: string;
  label: string;
  body: string;
};

type AdminWhatsappComposerProps = {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
  clientFirstName: string;
  templates: ReadonlyArray<WhatsAppTemplate>;
};

function fillTemplate(body: string, clientFirstName: string, applicationId: string) {
  return body.replaceAll("{{firstName}}", clientFirstName).replaceAll("{{applicationId}}", applicationId);
}

function WhatsAppSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex items-center justify-center gap-2 border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-wait disabled:opacity-80"
      disabled={pending}
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
  templates,
}: AdminWhatsappComposerProps) {
  const [body, setBody] = useState(() =>
    fillTemplate(templates[0]?.body ?? "", clientFirstName, applicationId),
  );

  const templateButtons = useMemo(
    () =>
      templates.map((template) => ({
        ...template,
        body: fillTemplate(template.body, clientFirstName, applicationId),
      })),
    [applicationId, clientFirstName, templates],
  );

  return (
    <form action={action}>
      <input type="hidden" name="applicationId" value={applicationId} />

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {templateButtons.map((template) => (
          <button
            key={template.key}
            type="button"
            className="border border-[#d8d1c3] px-3 py-2 text-left text-sm font-medium"
            onClick={() => setBody(template.body)}
          >
            {template.label}
          </button>
        ))}
      </div>

      <textarea
        className="mt-4 h-24 w-full border border-[#d8d1c3] bg-[#fffdf8] p-3 text-sm outline-none"
        name="body"
        onChange={(event) => setBody(event.target.value)}
        required
        value={body}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#6b5e4f]">Messages are stored against the application audit record.</p>
        <WhatsAppSubmitButton />
      </div>
    </form>
  );
}

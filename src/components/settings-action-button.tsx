"use client";

import { useFormStatus } from "react-dom";

type SettingsActionButtonProps = {
  children: string;
  pendingLabel?: string;
  className: string;
};

export function SettingsActionButton({ children, pendingLabel, className }: SettingsActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? pendingLabel ?? "Saving..." : children}
    </button>
  );
}

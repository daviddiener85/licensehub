"use client";

import { Printer } from "lucide-react";

type SupplierPrintButtonProps = {
  applicationId: string;
  className?: string;
};

export function SupplierPrintButton({ applicationId, className }: SupplierPrintButtonProps) {
  return (
    <a
      className={className}
      href={`/supplier/print-pack/${encodeURIComponent(applicationId)}`}
      target="_blank"
      rel="noreferrer"
    >
      <Printer className="h-4 w-4" />
      Print Pack
    </a>
  );
}

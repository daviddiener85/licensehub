"use client";

import { Printer } from "lucide-react";

type SupplierPrintButtonProps = {
  className?: string;
};

export function SupplierPrintButton({ className }: SupplierPrintButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.print();
      }}
    >
      <Printer className="h-4 w-4" />
      Print Pack
    </button>
  );
}

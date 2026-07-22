"use client";

import { useRouter, useSearchParams } from "next/navigation";

type AdminApplicationCellProps = {
  applicationId: string;
  children: React.ReactNode;
  className?: string;
};

export function AdminApplicationCell({ applicationId, children, className }: AdminApplicationCellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <button
      className={["block w-full text-left focus-visible:outline-none", className].filter(Boolean).join(" ")}
      onClick={() => {
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.set("application", applicationId);
        router.replace(`/admin?${nextParams.toString()}`, { scroll: false });
      }}
      type="button"
    >
      {children}
    </button>
  );
}

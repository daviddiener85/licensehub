"use client";

import { useRouter } from "next/navigation";

type AdminApplicationCellProps = {
  applicationId: string;
  children: React.ReactNode;
  className?: string;
};

export function AdminApplicationCell({ applicationId, children, className }: AdminApplicationCellProps) {
  const router = useRouter();

  return (
    <button
      className={["text-left", className].filter(Boolean).join(" ")}
      onClick={() => {
        router.replace(`/admin?application=${applicationId}`, { scroll: false });
      }}
      type="button"
    >
      {children}
    </button>
  );
}

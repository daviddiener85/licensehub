"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type AdminRefreshControllerProps = {
  enabled: boolean;
  intervalSeconds: number;
};

export function AdminRefreshController({ enabled, intervalSeconds }: AdminRefreshControllerProps) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const safeInterval = Math.max(5, intervalSeconds) * 1000;
    const refreshTimer = window.setInterval(() => {
      router.refresh();
    }, safeInterval);

    return () => window.clearInterval(refreshTimer);
  }, [enabled, intervalSeconds, router]);

  return (
    <span className="border border-[#d8d1c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#6b5e4f]">
      Auto-refresh: {enabled ? `${intervalSeconds}s` : "off"}
    </span>
  );
}

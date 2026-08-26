import Link from "next/link";
import { PoweredByTiqet } from "@/components/powered-by-tiqet";

type PublicFooterProps = {
  dark?: boolean;
};

export function PublicFooter({ dark = false }: PublicFooterProps) {
  const shellClass = dark
    ? "border-t border-white/15 bg-[#0c1114] text-white shadow-[0_-1px_0_rgba(255,255,255,0.04)]"
    : "border-t border-[#e5dccd] bg-[#f7f3ea] text-[#182024]";
  const linkClass = dark ? "text-white/86 hover:text-white" : "text-[#52615b] hover:text-[#182024]";

  return (
    <footer className={shellClass}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6 text-sm sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
        <div className="space-y-3">
          <p className={dark ? "max-w-md text-white/72" : "max-w-md text-[#6b5e4f]"}>
            Need help? Review the policies below or start a new request.
          </p>
          <div className="flex flex-wrap gap-4 font-semibold">
            <Link href="/terms-and-conditions" className={linkClass}>
              Terms & Conditions
            </Link>
            <Link href="/cancellations" className={linkClass}>
              Refund & Cancellation Policy
            </Link>
            <Link href="/apply" className={linkClass}>
              Start a new request
            </Link>
          </div>
        </div>
        <PoweredByTiqet />
      </div>
    </footer>
  );
}

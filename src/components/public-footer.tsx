import Link from "next/link";

type PublicFooterProps = {
  dark?: boolean;
};

export function PublicFooter({ dark = false }: PublicFooterProps) {
  const shellClass = dark ? "border-t border-white/10 bg-[#111719] text-white" : "border-t border-[#e5dccd] bg-[#f7f3ea] text-[#182024]";
  const linkClass = dark ? "text-white/72 hover:text-white" : "text-[#52615b] hover:text-[#182024]";

  return (
    <footer className={shellClass}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-5 text-sm sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
        <p className={dark ? "text-white/58" : "max-w-md text-[#6b5e4f]"}>
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
    </footer>
  );
}

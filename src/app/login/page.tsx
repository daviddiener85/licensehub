import { loginWithRolePasscode } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next && params.next.startsWith("/") ? params.next : "/admin";

  return (
    <main className="min-h-screen bg-[#f7f5ef] px-4 py-10 text-[#1f2724] sm:px-6 lg:px-8">
      <section className="mx-auto max-w-md border border-[#d8d1c3] bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase text-[#6b5e4f]">License Hub</p>
        <h1 className="mt-4 text-3xl font-semibold">Staff Login</h1>
        <p className="mt-3 text-sm leading-6 text-[#52615b]">
          Sign in with your role access key to continue.
        </p>
        <form action={loginWithRolePasscode} className="mt-6 space-y-4">
          <input type="hidden" name="nextPath" value={nextPath} />
          <label className="block text-sm font-semibold">
            Role
            <select name="role" defaultValue="ADMIN" className="mt-1 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal">
              <option value="ADMIN">Admin</option>
              <option value="SUPPLIER">Supplier</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Access key
            <input
              type="password"
              name="passcode"
              required
              className="mt-1 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal"
            />
          </label>
          <button className="w-full border border-[#1f2724] bg-[#1f2724] px-4 py-3 text-sm font-semibold text-white">
            Sign In
          </button>
        </form>
      </section>
    </main>
  );
}


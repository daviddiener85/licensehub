import { loginWithRolePasscode } from "@/lib/auth-actions";
import { LoginForm } from "@/components/login-form";

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
        <p className="text-sm font-semibold uppercase text-[#6b5e4f]">The License Hub</p>
        <h1 className="mt-4 text-3xl font-semibold">Staff Login</h1>
        <p className="mt-3 text-sm leading-6 text-[#52615b]">
          Sign in with your role access key to continue.
        </p>
        <LoginForm nextPath={nextPath} action={loginWithRolePasscode} />
      </section>
    </main>
  );
}

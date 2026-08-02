"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LoginFormProps = {
  nextPath: string;
  action: (formData: FormData) => Promise<{ error: string; redirectTo?: string }>;
};

type LoginFormState = {
  error: string;
  redirectTo?: string;
};

const initialState: LoginFormState = { error: "" };

export function LoginForm({ nextPath, action }: LoginFormProps) {
  const router = useRouter();
  const [role, setRole] = useState<"ADMIN" | "SUPPLIER">(nextPath.startsWith("/supplier") ? "SUPPLIER" : "ADMIN");
  const [state, formAction, pending] = useActionState(
    async (_previousState: LoginFormState, formData: FormData): Promise<LoginFormState> => action(formData),
    initialState,
  );

  useEffect(() => {
    if (state.redirectTo) {
      router.push(state.redirectTo);
    }
  }, [router, state.redirectTo]);

  const effectiveNextPath =
    role === "SUPPLIER"
      ? nextPath.startsWith("/supplier")
        ? nextPath
        : "/supplier"
      : nextPath.startsWith("/admin")
        ? nextPath
        : "/admin";

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="nextPath" value={effectiveNextPath} />
      <label className="block text-sm font-semibold">
        Role
        <select
          name="role"
          value={role}
          onChange={(event) => setRole(event.currentTarget.value as "ADMIN" | "SUPPLIER")}
          className="mt-1 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal"
        >
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
      {state.error ? (
        <p className="border border-[#b3261e] bg-[#fff5f3] px-3 py-2 text-sm text-[#7d3128]">{state.error}</p>
      ) : null}
      <button
        disabled={pending}
        className="w-full border border-[#1f2724] bg-[#1f2724] px-4 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Signing In..." : "Sign In"}
      </button>
    </form>
  );
}

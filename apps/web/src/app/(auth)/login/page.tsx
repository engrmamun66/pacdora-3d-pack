import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { googleEnabled } from "@/server/env";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  google: "Google sign-in failed or was cancelled.",
  account_not_linked:
    "This email already has a password account that is not confirmed yet. Confirm it from your inbox, then try Google again.",
};

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const err = typeof sp.error === "string" ? (ERRORS[sp.error] ?? "Sign-in failed.") : null;
  return <LoginForm next={next} googleEnabled={googleEnabled} initialError={err} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell
      title="Welcome back"
      description="Log in to your workspace."
      footer={<>No account? <Link className="underline" href="/register">Create one</Link></>}
    >
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

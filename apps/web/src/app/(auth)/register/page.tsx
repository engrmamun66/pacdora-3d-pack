import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { googleEnabled } from "@/server/env";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Free to start. No card needed."
      footer={<>Already have an account? <Link className="underline" href="/login">Log in</Link></>}
    >
      <RegisterForm googleEnabled={googleEnabled} />
    </AuthShell>
  );
}

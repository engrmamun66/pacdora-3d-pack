import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "@/components/auth/forgot-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="We will email you a link to choose a new password."
      footer={<Link className="underline" href="/login">Back to log in</Link>}
    >
      <ForgotForm />
    </AuthShell>
  );
}

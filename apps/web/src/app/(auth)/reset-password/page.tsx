import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/reset-form";

export const metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}

import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <AuthShell variant="admin" title="Admin sign in" description="Authorised staff only.">
      <AdminLoginForm />
    </AuthShell>
  );
}

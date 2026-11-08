import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { db } from "@/server/db";
import { ProfileForm } from "@/components/app/profile-form";

export const metadata = { title: "Settings" };

async function Profile() {
  const user = await requireUser();
  const accounts = await db.account.findMany({ where: { userId: user.id }, select: { providerId: true } });
  const methods = accounts.map((a) => (a.providerId === "credential" ? "Email & password" : a.providerId === "google" ? "Google" : a.providerId));
  return (
    <div className="flex max-w-lg flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Profile</h2>
        <ProfileForm name={user.name} />
      </section>
      <section className="flex flex-col gap-1 text-sm">
        <h2 className="font-medium">Account</h2>
        <p>Email: {user.email} {user.emailVerified ? "(confirmed)" : "(not confirmed)"}</p>
        <p>Sign-in methods: {methods.join(", ") || "none"}</p>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Suspense fallback={<div className="h-32 animate-pulse rounded-md bg-muted" />}>
        <Profile />
      </Suspense>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile, type ProfileState } from "./profile-actions";

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, { ok: false, message: null });
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" name="name" defaultValue={name} maxLength={100} required />
      </div>
      {state.message ? (
        <p role="status" className={state.ok ? "text-sm text-green-700" : "text-sm text-destructive"}>{state.message}</p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">{pending ? "Saving…" : "Save"}</Button>
    </form>
  );
}

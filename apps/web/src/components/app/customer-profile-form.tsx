"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notify";
import type { ProfileState } from "./profile-actions";
import { updateCustomerProfile } from "./customer-profile-actions";

export interface ProfileValues {
  name: string;
  phone: string;
  altPhone: string;
  businessName: string;
  businessAddress: string;
}

export function CustomerProfileForm({ values }: { values: ProfileValues }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateCustomerProfile, { ok: false, message: null });
  useEffect(() => {
    if (state.ok) {
      router.refresh();
      notify.success("Profile saved", { id: "profile-save" });
    } else if (state.message) notify.error(state.message, { id: "profile-save" });
  }, [state, router]);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="name">Username</Label>
        <Input id="name" name="name" defaultValue={values.name} maxLength={100} required autoComplete="nickname" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={values.phone} maxLength={20} autoComplete="tel" placeholder="+880 1712 345678" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="altPhone">Alternative phone</Label>
        <Input id="altPhone" name="altPhone" type="tel" defaultValue={values.altPhone} maxLength={20} placeholder="Optional" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input id="businessName" name="businessName" defaultValue={values.businessName} maxLength={120} autoComplete="organization" placeholder="Optional" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="businessAddress">Business address</Label>
        <textarea
          id="businessAddress"
          name="businessAddress"
          defaultValue={values.businessAddress}
          maxLength={300}
          rows={3}
          autoComplete="street-address"
          placeholder="Optional"
          className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
        {state.message && !state.ok ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
      </div>
    </form>
  );
}

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ComponentProps } from "react";

export function Field({ label, id, ...props }: { label: string; id: string } & ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

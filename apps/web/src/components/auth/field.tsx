"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Labelled input. Password fields get a show/hide toggle. */
export function Field({ label, id, hint, className, ...props }: { label: string; id: string; hint?: ReactNode } & ComponentProps<typeof Input>) {
  const [shown, setShown] = useState(false);
  const isPassword = props.type === "password";
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          aria-describedby={hintId}
          {...props}
          type={isPassword && shown ? "text" : props.type}
          className={`h-10 px-3 ${isPassword ? "pr-10" : ""} ${className ?? ""}`}
        />
        {isPassword ? (
          <button
            type="button"
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            onClick={() => setShown((v) => !v)}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
          >
            {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        ) : null}
      </div>
      {hint ? <div id={hintId} className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

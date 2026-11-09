"use client";

import { notify } from "@/lib/notify";

/** Lets an admin see all four message styles exactly as visitors will. */
export function ToastTester() {
  const items = [
    { label: "Success", run: () => notify.success("Saved", { description: "Your changes are live." }) },
    { label: "Error", run: () => notify.error("Something went wrong", { description: "Nothing was changed. Please try again." }) },
    { label: "Warning", run: () => notify.warning("Check your input", { description: "Some values need your attention." }) },
    { label: "Info", run: () => notify.info("Heads up", { description: "This is a neutral message." }) },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button key={i.label} type="button" onClick={i.run} className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted">
          {i.label}
        </button>
      ))}
    </div>
  );
}

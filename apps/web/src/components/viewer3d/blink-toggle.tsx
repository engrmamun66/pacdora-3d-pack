"use client";

import { InfoTip } from "@/components/templates-admin/help-tip";

/** "Blink Mode" checkbox: while on, the panel under the mouse on the flat sheet blinks on the 3D box. */
export function BlinkToggle({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex w-fit items-center gap-1.5 text-sm font-medium">
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        Blink Mode
      </label>
      <InfoTip label="Blink Mode">Move the mouse over a panel on the flat sheet and the same panel blinks softly on the 3D box, so you can see which one it is. A panel hidden inside the closed box shows faintly through it.</InfoTip>
    </div>
  );
}

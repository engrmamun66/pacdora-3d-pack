"use client";

import { useEffect, useState } from "react";
import type { DielineGeometry, WindowSpec } from "@packaging/dieline-engine";
import { WindowEditor } from "@/components/dielines/window-editor";
import type { Unit } from "@/components/dielines/units";

/**
 * The window hole editor as a full-screen modal that slides up when it opens and slides down when it closes
 * (the same motion as on the customer's page). Mounted only while it is open or sliding away.
 */
export function WindowEditorModal({
  open,
  geo,
  value,
  unit,
  onUnit,
  onDone,
  onCancel,
  thickness,
  boardColor = "#c9a574",
}: {
  open: boolean;
  /** The dieline at its starting size, without windows. */
  geo: DielineGeometry;
  value: readonly WindowSpec[];
  unit: Unit;
  onUnit: (u: Unit) => void;
  onDone: (windows: WindowSpec[]) => void;
  onCancel: () => void;
  thickness: number;
  boardColor?: string;
}) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const t = window.setTimeout(() => setMounted(false), 320); // after the slide-down
    return () => window.clearTimeout(t);
  }, [open, mounted]);
  if (!mounted) return null;
  const closing = !open;
  return (
    <div role="dialog" aria-modal="true" aria-label="Window holes" className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-background ${closing ? "wh-exit" : "wh-enter"}`}>
      <WindowEditor geo={geo} value={value} unit={unit} onUnit={onUnit} onCancel={onCancel} onDone={onDone} materialId={undefined} boardColor={boardColor} thickness={thickness} watermark={null} />
    </div>
  );
}

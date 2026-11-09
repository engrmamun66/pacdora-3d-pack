"use client";

import { useMemo } from "react";
import { getGenerator, getPreset } from "@packaging/dieline-engine";
import { DielineLines } from "@/components/marketing/hero-carton";

/** Decorative dieline drawn from our own engine (same one the product uses). */
export function AuthArt() {
  const geo = useMemo(() => {
    const preset = getPreset("straight-tuck-end-box")!;
    return getGenerator(preset.generatorId).generate({ ...preset.defaults, width: 70, depth: 45, height: 110 });
  }, []);
  return <DielineLines geo={geo} className="absolute -right-10 bottom-14 h-[40%] w-auto text-white/30" />;
}

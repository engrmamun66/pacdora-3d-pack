"use client";

import { useState } from "react";
import { TemplateWizard, type WizardCategory, type WizardInitial } from "./template-wizard";
import type { SvgColorSettings } from "@/lib/svg-colors";

/**
 * The Add template page. The admin layout keeps a page's state while the admin goes elsewhere, so after a template is
 * saved the form would still hold the old file and answers. A new key after every save gives the next template an empty form.
 */
export function NewTemplate({ categories, initial, svgColors }: { categories: WizardCategory[]; initial: WizardInitial; svgColors: SvgColorSettings }) {
  const [fresh, setFresh] = useState(0);
  return <TemplateWizard key={fresh} mode="create" categories={categories} initial={initial} svgColors={svgColors} onCreated={() => setFresh((n) => n + 1)} />;
}

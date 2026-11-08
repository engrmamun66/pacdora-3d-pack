import type { DielineGeometry } from "../geometry-types";
import { tuckEndInputSchema } from "./tuck-end-params";
import { generateTuckEndCarton, TUCK_END_TEMPLATE_ID } from "./tuck-end-carton";

/** UI metadata for one generator parameter (drives the parameter form). */
export type ParamDescriptor =
  | {
      readonly key: string;
      readonly kind: "number";
      readonly label: string;
      readonly unit: "mm" | "factor";
      readonly group: ParamGroup;
      readonly min: number;
      readonly max: number;
      readonly step: number;
      /** Optional parameters may be left empty: the engine fills a (documented) default. */
      readonly optional: boolean;
      readonly help?: string;
      /** Show only when another parameter has this value. */
      readonly showWhen?: { readonly key: string; readonly equals: string };
    }
  | {
      readonly key: string;
      readonly kind: "enum";
      readonly label: string;
      readonly group: ParamGroup;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly help?: string;
      readonly showWhen?: { readonly key: string; readonly equals: string };
    };

export type ParamGroup = "Dimensions" | "Structure" | "Material" | "Print" | "Flaps (advanced)";

export interface GeneratorDefinition {
  readonly id: string;
  readonly name: string;
  /** Bumped when parameter meaning changes; stored in every project. */
  readonly schemaVersion: number;
  readonly params: readonly ParamDescriptor[];
  /** Validates input and returns checked geometry, or throws ParamValidationError. */
  readonly generate: (input: unknown) => DielineGeometry;
  /** Keys of the input schema (used by tests to keep descriptors in sync). */
  readonly schemaKeys: readonly string[];
}

const num = (
  key: string,
  label: string,
  group: ParamGroup,
  min: number,
  max: number,
  opts: { step?: number; optional?: boolean; unit?: "mm" | "factor"; help?: string; showWhen?: { key: string; equals: string } } = {},
): ParamDescriptor => ({
  key,
  kind: "number",
  label,
  unit: opts.unit ?? "mm",
  group,
  min,
  max,
  step: opts.step ?? 0.5,
  optional: opts.optional ?? false,
  ...(opts.help ? { help: opts.help } : {}),
  ...(opts.showWhen ? { showWhen: opts.showWhen } : {}),
});

export const tuckEndDefinition: GeneratorDefinition = {
  id: TUCK_END_TEMPLATE_ID,
  name: "Tuck end carton",
  schemaVersion: 1,
  generate: generateTuckEndCarton,
  schemaKeys: Object.keys(tuckEndInputSchema.shape),
  params: [
    num("width", "Width", "Dimensions", 10, 1000, { step: 1, help: "Front/back panel width." }),
    num("depth", "Depth", "Dimensions", 10, 1000, { step: 1, help: "Side panel width." }),
    num("height", "Height", "Dimensions", 10, 1000, { step: 1 }),
    {
      key: "variant",
      kind: "enum",
      label: "Tuck style",
      group: "Structure",
      options: [
        { value: "straight", label: "Straight tuck end (both tucks on the same side)" },
        { value: "reverse", label: "Reverse tuck end (tucks on opposite sides)" },
      ],
    },
    {
      key: "sizeMode",
      kind: "enum",
      label: "Size mode",
      group: "Structure",
      options: [
        { value: "manufacture", label: "Manufacture (crease-to-crease)" },
        { value: "inner", label: "Inner (inside of the box)" },
      ],
    },
    num("thickness", "Board thickness", "Material", 0.05, 5, { step: 0.05 }),
    num("allowanceFactor", "Allowance (x thickness)", "Material", 0, 5, {
      step: 0.1,
      unit: "factor",
      optional: true,
      help: "Added to each dimension in inner size mode. Confirm with your printer.",
      showWhen: { key: "sizeMode", equals: "inner" },
    }),
    num("bleed", "Bleed", "Print", 0, 20),
    num("safeMargin", "Safe margin", "Print", 0, 20),
    num("glueFlapWidth", "Glue flap width", "Flaps (advanced)", 2, 100, { optional: true }),
    num("glueFlapBevel", "Glue flap bevel", "Flaps (advanced)", 0, 50, { optional: true }),
    num("tuckDepth", "Tuck flap depth", "Flaps (advanced)", 2, 500, { optional: true }),
    {
      key: "tuckCornerStyle",
      kind: "enum",
      label: "Tuck corners",
      group: "Flaps (advanced)",
      options: [
        { value: "round", label: "Rounded" },
        { value: "chamfer", label: "Chamfered" },
      ],
    },
    num("tuckCornerCut", "Tuck corner size", "Flaps (advanced)", 0, 50, { optional: true }),
    num("tuckSlitLength", "Tuck slit length", "Flaps (advanced)", 0, 50, { help: "0 = no slits." }),
    num("dustFlapDepth", "Dust flap depth", "Flaps (advanced)", 2, 500, { optional: true }),
    num("dustFlapInset", "Dust flap taper", "Flaps (advanced)", 0, 100, { optional: true }),
    num("dustFlapCornerRadius", "Dust flap corner radius", "Flaps (advanced)", 0, 50, { optional: true }),
  ],
};

export const generators: Readonly<Record<string, GeneratorDefinition>> = {
  [tuckEndDefinition.id]: tuckEndDefinition,
};

export function getGenerator(id: string): GeneratorDefinition {
  const g = generators[id];
  if (!g) throw new Error(`Unknown template generator "${id}". Known: ${Object.keys(generators).join(", ")}`);
  return g;
}

/**
 * A catalogue entry: our own named preset of a generator. Names describe
 * generic industry structures; no third-party catalogue content is used.
 */
export interface TemplatePreset {
  readonly id: string;
  readonly generatorId: string;
  readonly name: string;
  readonly category: TemplateCategory;
  readonly description: string;
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly tags: readonly string[];
}

export type TemplateCategory = "folding-carton" | "mailer" | "shipping" | "tray" | "sleeve" | "food";

export const CATEGORY_LABELS: Readonly<Record<TemplateCategory, string>> = {
  "folding-carton": "Folding cartons",
  mailer: "Mailer boxes",
  shipping: "Shipping boxes",
  tray: "Trays",
  sleeve: "Sleeves",
  food: "Food packaging",
};

export const templateCatalog: readonly TemplatePreset[] = [
  {
    id: "straight-tuck-end-box",
    generatorId: TUCK_END_TEMPLATE_ID,
    name: "Straight tuck end box",
    category: "folding-carton",
    description: "Folding carton with top and bottom tuck flaps opening on the same side. Common for retail products.",
    defaults: { variant: "straight", width: 70, depth: 40, height: 120 },
    tags: ["tuck end", "retail", "cosmetics"],
  },
  {
    id: "reverse-tuck-end-box",
    generatorId: TUCK_END_TEMPLATE_ID,
    name: "Reverse tuck end box",
    category: "folding-carton",
    description: "Folding carton with tuck flaps on opposite sides; efficient nesting on the printed sheet.",
    defaults: { variant: "reverse", width: 70, depth: 40, height: 120 },
    tags: ["tuck end", "retail", "pharmacy"],
  },
  {
    id: "tuck-end-box-with-slit-locks",
    generatorId: TUCK_END_TEMPLATE_ID,
    name: "Tuck end box with slit locks",
    category: "folding-carton",
    description: "Straight tuck end box with slits at the tuck creases so the closed flaps hold more firmly.",
    defaults: { variant: "straight", width: 90, depth: 60, height: 90, tuckSlitLength: 3 },
    tags: ["tuck end", "slit lock"],
  },
];

export function getPreset(id: string): TemplatePreset | undefined {
  return templateCatalog.find((t) => t.id === id);
}

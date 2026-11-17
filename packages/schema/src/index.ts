import { z } from "zod";
import { artworkSchema } from "./artwork";

export * from "./artwork";

/**
 * ProjectDoc: the single source of truth for a packaging project, stored as
 * JSONB in `project.projectData` and exported as the JSON project file.
 *
 * Geometry is NOT stored: it is regenerated deterministically from
 * template.generatorId + template.params by the dieline engine. engineVersion
 * records which engine produced the last saved state (for traceability).
 *
 * Versioning: every breaking change bumps PROJECT_DOC_VERSION and adds a
 * migration in `migrations` so older files keep opening.
 */
export const PROJECT_DOC_VERSION = 1 as const;

const paramValue = z.union([z.number().finite(), z.string().max(100), z.boolean()]);

/**
 * A window hole cut through one panel (see the dieline engine's windows.ts, which also checks the rules).
 * Coordinates are in the sheet's frame, in mm. The shape name is checked by the engine.
 */
export const windowSchema = z.object({
  id: z.string().min(1).max(40),
  shape: z.string().min(1).max(30),
  cx: z.number().finite(),
  cy: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  rotation: z.number().finite().min(-360).max(360),
  /** Only for the grid shape: rows and columns of holes, and the bar between them (mm). The engine checks that they fit. */
  rows: z.number().int().min(1).max(12).optional(),
  cols: z.number().int().min(1).max(12).optional(),
  bar: z.number().finite().positive().max(50).optional(),
  /** Only for the custom shape (pen tool or traced picture): outlines as x, y, x, y... with both axes from -0.5 to 0.5. The engine checks them. */
  loops: z.array(z.array(z.number().finite().min(-0.51).max(0.51)).min(6).max(3000)).max(12).optional(),
  /** Only for the custom shape: the anchors of the drawn path (so "Edit points" can open it again), in the window's box. */
  path: z
    .array(
      z.object({
        x: z.number().finite().min(-3).max(3),
        y: z.number().finite().min(-3).max(3),
        hin: z.tuple([z.number().finite().min(-6).max(6), z.number().finite().min(-6).max(6)]).nullable().optional(),
        hout: z.tuple([z.number().finite().min(-6).max(6), z.number().finite().min(-6).max(6)]).nullable().optional(),
        smooth: z.boolean().optional(),
      }),
    )
    .min(3)
    .max(400)
    .optional(),
}).refine((w) => (w.loops ?? []).reduce((n, l) => n + l.length, 0) <= 3000, "The outline has too many points.");
export type WindowDoc = z.infer<typeof windowSchema>;

export const projectDocV1 = z.object({
  schemaVersion: z.literal(1),
  meta: z.object({
    name: z.string().trim().min(1).max(120),
    unit: z.literal("mm"),
    engineVersion: z.string().max(20),
  }),
  template: z.object({
    presetId: z.string().min(1).max(100),
    generatorId: z.string().min(1).max(100),
    generatorSchemaVersion: z.number().int().positive(),
    /** Raw user parameters (validated by the generator, not here). */
    params: z.record(z.string().max(60), paramValue),
  }),
  /** Artwork placed on the dieline (see artwork.ts). */
  artwork: artworkSchema,
  /** Window holes the customer cut into the box (absent = none). Older files have none. */
  windows: z.array(windowSchema).max(24).optional(),
  threeD: z.object({
    foldProgress: z.number().min(0).max(1),
    outsideColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    insideColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  export: z.object({
    includeBleed: z.boolean(),
    includeDimensions: z.boolean(),
  }),
});

export type ProjectDocV1 = z.infer<typeof projectDocV1>;
export type ProjectDoc = ProjectDocV1;

/** Upgraders from older versions to the next one, keyed by source version. */
const migrations: Record<number, (doc: unknown) => unknown> = {
  // 1: (doc) => ({ ...doc, schemaVersion: 2, ... }),
};

export class ProjectDocError extends Error {
  constructor(message: string, public readonly issues: readonly string[] = []) {
    super(message);
    this.name = "ProjectDocError";
  }
}

/** Parse any stored/imported document, migrating older versions first. */
export function parseProjectDoc(input: unknown): ProjectDoc {
  let doc = input;
  for (let guard = 0; guard < 50; guard++) {
    const v = (doc as { schemaVersion?: unknown })?.schemaVersion;
    if (v === PROJECT_DOC_VERSION) break;
    if (typeof v !== "number" || !Number.isInteger(v)) throw new ProjectDocError("Not a project file: missing schemaVersion.");
    if (v > PROJECT_DOC_VERSION) throw new ProjectDocError(`Project file version ${v} is newer than this app supports (${PROJECT_DOC_VERSION}).`);
    const up = migrations[v];
    if (!up) throw new ProjectDocError(`No migration from project file version ${v}.`);
    doc = up(doc);
  }
  const parsed = projectDocV1.safeParse(doc);
  if (!parsed.success) {
    throw new ProjectDocError(
      "Invalid project file.",
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return parsed.data;
}

/** A fresh document for a new project. */
export function newProjectDoc(args: {
  name: string;
  presetId: string;
  generatorId: string;
  generatorSchemaVersion: number;
  engineVersion: string;
  params: Record<string, number | string | boolean>;
}): ProjectDoc {
  return parseProjectDoc({
    schemaVersion: PROJECT_DOC_VERSION,
    meta: { name: args.name, unit: "mm", engineVersion: args.engineVersion },
    template: {
      presetId: args.presetId,
      generatorId: args.generatorId,
      generatorSchemaVersion: args.generatorSchemaVersion,
      params: args.params,
    },
    artwork: { objects: [] },
    threeD: { foldProgress: 1, outsideColor: "#ffffff", insideColor: "#c8a97e" },
    export: { includeBleed: true, includeDimensions: false },
  });
}

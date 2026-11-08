import { describe, expect, it } from "vitest";
import { PROJECT_DOC_VERSION, ProjectDocError, newProjectDoc, parseProjectDoc } from "../src";

const make = () =>
  newProjectDoc({
    name: "My carton",
    presetId: "straight-tuck-end-box",
    generatorId: "tuck-end-carton",
    generatorSchemaVersion: 1,
    engineVersion: "0.2.0",
    params: { width: 70, depth: 40, height: 120, variant: "straight" },
  });

describe("ProjectDoc", () => {
  it("creates a valid current-version document", () => {
    const d = make();
    expect(d.schemaVersion).toBe(PROJECT_DOC_VERSION);
    expect(d.meta.unit).toBe("mm");
    expect(d.artwork.objects).toEqual([]);
  });

  it("round-trips through JSON", () => {
    const d = make();
    expect(parseProjectDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("rejects files without a version", () => {
    expect(() => parseProjectDoc({ meta: {} })).toThrow(ProjectDocError);
  });

  it("rejects files from a newer app version", () => {
    expect(() => parseProjectDoc({ ...make(), schemaVersion: 99 })).toThrow(/newer/);
  });

  it("rejects malformed content with readable issues", () => {
    try {
      parseProjectDoc({ ...make(), threeD: { foldProgress: 2, outsideColor: "red", insideColor: "#000000" } });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectDocError);
      expect((e as ProjectDocError).issues.join(" ")).toMatch(/foldProgress/);
    }
  });

  it("rejects an empty name", () => {
    expect(() => parseProjectDoc({ ...make(), meta: { ...make().meta, name: "  " } })).toThrow(ProjectDocError);
  });
});

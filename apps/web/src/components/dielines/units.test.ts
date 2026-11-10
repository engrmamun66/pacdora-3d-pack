import { describe, expect, it } from "vitest";
import { CUSTOM_GRADE, MATERIAL_TYPES, fmtLength, fmtRange, gradeLabel, materialFor, materialsFor } from "./units";

describe("materials", () => {
  const grade = (type: string, id: string) => MATERIAL_TYPES.find((t) => t.id === type)!.grades.find((g) => g.id === id)!;

  it("has the four families with the agreed grades", () => {
    expect(MATERIAL_TYPES.map((t) => t.label)).toEqual(["White paperboard", "Kraft paperboard", "Art paper", "Corrugated board"]);
    expect(MATERIAL_TYPES.map((t) => t.grades.length)).toEqual([6, 4, 3, 5]);
    expect(grade("white-paperboard", "wp-210").thickness).toBe(0.27);
    expect(grade("white-paperboard", "wp-400").thickness).toBe(0.55);
    expect(grade("kraft-paperboard", "kp-190").thickness).toBe(0.26);
    expect(grade("art-paper", "ap-350").thickness).toBe(0.32);
  });

  it("custom grades start at their default and carry a suggestion", () => {
    const c = (t: string) => grade(t, CUSTOM_GRADE);
    expect([c("white-paperboard").thickness, c("kraft-paperboard").thickness, c("art-paper").thickness, c("corrugated").thickness]).toEqual([1.5, 0.5, 0.2, 1.5]);
    expect(c("corrugated").suggest).toEqual([0.8, 3]);
    expect(c("art-paper").suggest).toEqual([0.2, 0.5]);
    expect(MATERIAL_TYPES.every((t) => t.grades.filter((g) => g.fixed).every((g) => g.suggest === undefined))).toBe(true);
  });

  it("flutes can be changed within their range and start inside it", () => {
    for (const id of ["cb-n", "cb-f", "cb-e", "cb-b"]) {
      const g = grade("corrugated", id);
      expect(g.fixed).toBe(false);
      expect(g.thickness).toBeGreaterThanOrEqual(g.suggest![0]);
      expect(g.thickness).toBeLessThanOrEqual(g.suggest![1]);
    }
  });

  it("shows lengths in the chosen unit", () => {
    expect(fmtLength(0.27, "mm")).toBe("0.27 mm");
    expect(fmtLength(25.4, "in")).toBe("1 in");
    expect(fmtLength(0.27, "in")).toBe("0.0106 in");
    expect(fmtRange([0.8, 3], "mm")).toBe("0.8~3 mm");
    expect(fmtRange([0.8, 3], "in")).toBe("0.0315~0.1181 in");
    expect(gradeLabel(grade("white-paperboard", "wp-210"), "mm")).toBe("210g white paperboard (0.27 mm)");
    expect(gradeLabel(grade("white-paperboard", "wp-210"), "in")).toBe("210g white paperboard (0.0106 in)");
    expect(gradeLabel(grade("corrugated", "cb-n"), "mm")).toBe("N-flute");
  });

  it("offers only what fits the template's thickness range", () => {
    expect(materialsFor(0.05, 5).map((t) => t.id)).toEqual(["white-paperboard", "kraft-paperboard", "art-paper", "corrugated"]);
    const slotted = materialsFor(0.5, 15);
    expect(slotted.map((t) => t.id)).toEqual(["white-paperboard", "corrugated"]);
    expect(slotted[0]!.grades.map((g) => g.id)).toEqual(["wp-350", "wp-400", CUSTOM_GRADE]);
    expect(slotted.find((t) => t.id === "corrugated")!.grades.map((g) => g.id)).toEqual(["cb-n", "cb-f", "cb-e", "cb-b", CUSTOM_GRADE]);
  });

  it("maps a stored thickness back to a selection", () => {
    expect(materialFor(0.35)).toEqual({ typeId: "white-paperboard", gradeId: "wp-250" });
    expect(materialFor(0.46)).toEqual({ typeId: "kraft-paperboard", gradeId: "kp-350" });
    expect(materialFor(2.2)).toEqual({ typeId: "corrugated", gradeId: CUSTOM_GRADE });
    expect(materialFor(0.1)).toEqual({ typeId: "white-paperboard", gradeId: CUSTOM_GRADE });
  });
});

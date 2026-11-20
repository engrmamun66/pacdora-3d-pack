import { describe, expect, it } from "vitest";
import { templateNameFromFile } from "./template-name";

describe("templateNameFromFile", () => {
  it("lowercases everything except the first letter", () => {
    expect(templateNameFromFile("gable-box-with-window-dieline.svg")).toBe("Gable box with window dieline");
    expect(templateNameFromFile("CUSTOM_Dimensions Box.SVG")).toBe("Custom dimensions box");
    expect(templateNameFromFile("Mailer BOX (2).svg")).toBe("Mailer box (2)");
  });
  it("copes with an empty name", () => {
    expect(templateNameFromFile(".svg")).toBe("");
  });
});

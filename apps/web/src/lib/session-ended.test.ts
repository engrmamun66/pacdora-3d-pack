import { describe, expect, it } from "vitest";
import { usesSignInBox } from "./session-ended";

describe("usesSignInBox", () => {
  it("is true for the Dieline page and the Online design page", () => {
    expect(usesSignInBox("/template/dieline/abc")).toBe(true);
    expect(usesSignInBox("/projects/p1")).toBe(true);
    expect(usesSignInBox("/editor/p1")).toBe(true);
  });
  it("is false for other pages", () => {
    expect(usesSignInBox("/my-dashboard")).toBe(false);
    expect(usesSignInBox("/templates")).toBe(false);
    expect(usesSignInBox("/doraadmin/users")).toBe(false);
    expect(usesSignInBox("/projects")).toBe(false);
  });
});

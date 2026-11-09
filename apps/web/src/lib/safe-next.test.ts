import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext (open-redirect guard)", () => {
  it.each([
    ["/settings", "/settings"],
    ["/projects/abc?tab=2", "/projects/abc?tab=2"],
    ["//evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
    ["/\t/evil.com", "/dashboard"],
    ["/\n/evil.com", "/dashboard"],
    ["/ok\\..\\evil", "/dashboard"],
    ["/a b", "/dashboard"],
    ["https://evil.com", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    ["", "/dashboard"],
    [null, "/dashboard"],
    [undefined, "/dashboard"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

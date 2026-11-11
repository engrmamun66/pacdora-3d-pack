import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext (open-redirect guard)", () => {
  it.each([
    ["/settings", "/settings"],
    ["/projects/abc?tab=2", "/projects/abc?tab=2"],
    ["//evil.com", "/my-dashboard"],
    ["/\\evil.com", "/my-dashboard"],
    ["/\t/evil.com", "/my-dashboard"],
    ["/\n/evil.com", "/my-dashboard"],
    ["/ok\\..\\evil", "/my-dashboard"],
    ["/a b", "/my-dashboard"],
    ["https://evil.com", "/my-dashboard"],
    ["javascript:alert(1)", "/my-dashboard"],
    ["", "/my-dashboard"],
    [null, "/my-dashboard"],
    [undefined, "/my-dashboard"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

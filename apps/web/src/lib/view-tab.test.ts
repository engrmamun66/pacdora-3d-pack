import { describe, expect, it } from "vitest";
import { readViewTab, withViewTab } from "./view-tab";

describe("view tab query", () => {
  it("reads a known tab, else Dieline", () => {
    expect(readViewTab("split")).toBe("split");
    expect(readViewTab("3d")).toBe("3d");
    expect(readViewTab(["split", "3d"])).toBe("split");
    expect(readViewTab("nope")).toBe("dieline");
    expect(readViewTab(undefined)).toBe("dieline");
  });
  it("writes the tab into the URL and keeps the rest", () => {
    expect(withViewTab("http://x.test/template/dieline/a?p=1", "split")).toBe("http://x.test/template/dieline/a?p=1&view=split");
    expect(withViewTab("http://x.test/a?view=3d&p=1", "dieline")).toBe("http://x.test/a?p=1");
    expect(withViewTab("http://x.test/a?view=3d", "split")).toBe("http://x.test/a?view=split");
  });
});

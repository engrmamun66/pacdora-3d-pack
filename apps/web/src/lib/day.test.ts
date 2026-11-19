import { describe, expect, it } from "vitest";
import { formatDay, parseDay } from "./day";

describe("calendar days", () => {
  it("round-trips a day without a time-zone shift", () => {
    for (const t of ["2026-11-19", "2026-01-01", "2024-02-29", "2026-12-31"]) expect(formatDay(parseDay(t)!)).toBe(t);
  });

  it("rejects text that is not a real day", () => {
    for (const t of ["", "2026-13-01", "2026-02-30", "19-11-2026", "2026-1-1", "nope"]) expect(parseDay(t)).toBeUndefined();
    expect(parseDay(undefined)).toBeUndefined();
  });
});

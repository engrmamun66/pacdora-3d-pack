import { describe, expect, it } from "vitest";
import { formatPhone, maskPhone, normalizeBdPhone } from "./phone";

describe("normalizeBdPhone", () => {
  it("gives one form for every way of writing the same number", () => {
    for (const v of ["01712345678", "1712345678", "8801712345678", "+8801712345678", "+880 1712-345678", "(880) 01712 345678", "008801712345678", " 01712-345 678 "]) {
      expect(normalizeBdPhone(v)).toBe("8801712345678");
    }
  });
  it("refuses what is not a Bangladesh mobile number", () => {
    for (const v of ["", "abc", "0171234567", "017123456789", "01212345678", "01112345678", "+14155550123", "8801712", "02-9876543"]) {
      expect(normalizeBdPhone(v)).toBeNull();
    }
  });
});

describe("formatPhone and maskPhone", () => {
  it("format for screens", () => {
    expect(formatPhone("8801712345678")).toBe("+880 1712-345678");
    expect(maskPhone("8801712345678")).toBe("+880 17••-••5678");
  });
  it("leave odd values alone", () => {
    expect(formatPhone("123")).toBe("123");
    expect(maskPhone("123")).toBe("••••");
  });
});

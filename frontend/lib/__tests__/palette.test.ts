import { describe, expect, it } from "vitest";
import { PALETTE, readableTextOn } from "../palette";

// WCAG 2.x contrast, written out here rather than reusing palette.ts.
function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("readableTextOn", () => {
  it("reaches WCAG AA (4.5:1) on every palette colour", () => {
    for (const fill of PALETTE) {
      expect(contrast(fill, readableTextOn(fill))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("puts dark text on the yellow class colour", () => {
    expect(readableTextOn("#F0E442")).toBe("#0f172a");
  });
});

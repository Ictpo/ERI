import { describe, expect, it } from "vitest";
import { PALETTE, TEXT_HUES, readableTextOn, wordPaint } from "../palette";

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

describe("wordPaint", () => {
  it("keeps every palette hue on the word, with letters and edge at AA", () => {
    for (const hue of PALETTE) {
      for (const size of [11, 20, 33]) {
        const p = wordPaint(hue, size);
        expect([p.fill, p.stroke]).toContain(hue);
        expect(contrast(p.fill, p.stroke)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("TEXT_HUES", () => {
  it("are palette colours readable as small text on white", () => {
    expect(TEXT_HUES.length).toBeGreaterThanOrEqual(2);
    for (const c of TEXT_HUES) {
      expect(PALETTE as readonly string[]).toContain(c);
      expect(contrast(c, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });
});

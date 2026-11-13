import { describe, expect, it, vi } from "vitest";

// lib/export.ts pulls in UI modules behind the "@/" alias; only CHART_FONT is needed.
vi.mock("../export", () => ({ CHART_FONT: "Arial, sans-serif" }));

import { buildAfcHtml } from "../afc-html";
import { selectWords } from "../afc-select";
import type { AfcPoint, AfcResult } from "../types";

const pt = (label: string, x: number, y: number, cx: number, cy: number, freq = 5): AfcPoint => ({
  label, x, y, z: null, mass: 0.1, contrib_x: cx, contrib_y: cy, contrib_z: null, freq,
});
const result: AfcResult = {
  explained: [55.2, 30.1],
  rows: [pt("casa", 1, 0.5, 60, 10), pt("rua_", -1, 0.2, 30, 50), pt("café <b>", 0.1, -0.9, 10, 40)],
  cols: [pt("TIPO_A", 0.8, 0.3, 50, 40, 20), pt("TIPO_B", -0.7, -0.4, 50, 60, 22)],
};

describe("buildAfcHtml", () => {
  const html = buildAfcHtml({
    result, ax: 0, ay: 1, variable: "TIPO", about: "Language pt, min freq 3",
    modalityColor: "#851445", mode: "above-average", date: "2026-01-02",
  });
  const rule = selectWords({
    rows: result.rows, ax: 0, ay: 1, inertiaX: 55.2, inertiaY: 30.1, mode: "above-average",
  }).rule;

  it("contains every word and modality", () => {
    for (const w of ["casa", "rua", "café &lt;b&gt;", "TIPO_A", "TIPO_B"]) expect(html).toContain(w);
    expect(html).not.toContain("café <b>");
  });
  it("has no external references", () => {
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
    expect(html).not.toContain("<script src");
    expect(html).not.toContain("<link");
  });
  it("contains the rule, settings, inertia and date", () => {
    expect(html).toContain(rule.replace(/>/g, "&gt;")); // escaped for HTML
    expect(html).toContain("Language pt, min freq 3");
    expect(html).toContain("55.2%");
    expect(html).toContain("2026-01-02");
  });
});

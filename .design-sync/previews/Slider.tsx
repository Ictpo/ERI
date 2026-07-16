import * as React from "react";
import { Label, Slider } from "frontend";

export const Default = () => (
  <div style={{ width: 320 }}>
    <Slider defaultValue={[40]} min={10} max={80} step={5} />
  </div>
);

export const WithLabel = () => (
  <div style={{ display: "grid", gap: 8, width: 320 }}>
    <Label>
      Minimum gap between words: <span style={{ fontVariantNumeric: "tabular-nums" }}>6px</span>
    </Label>
    <Slider defaultValue={[6]} min={0} max={12} step={1} />
  </div>
);

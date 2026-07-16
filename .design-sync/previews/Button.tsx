import * as React from "react";
import { Button } from "frontend";

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Button>Run analysis</Button>
    <Button variant="secondary">Save corpus</Button>
    <Button variant="outline">Export .txt</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="destructive">Delete project</Button>
    <Button variant="link">View documentation</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const Disabled = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button disabled>Saving…</Button>
    <Button variant="outline" disabled>
      Export .txt
    </Button>
  </div>
);

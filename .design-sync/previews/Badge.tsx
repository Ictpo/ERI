import * as React from "react";
import { Badge } from "frontend";

export const Variants = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
    <Badge>6 classes</Badge>
    <Badge variant="secondary">2,357 segments</Badge>
    <Badge variant="outline">min_freq 3</Badge>
    <Badge variant="success">100% classified</Badge>
    <Badge variant="warning">3 warnings</Badge>
    <Badge variant="destructive">error</Badge>
  </div>
);

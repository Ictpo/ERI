import * as React from "react";
import { Input, Label } from "frontend";

export const Default = () => (
  <div style={{ display: "grid", gap: 6, width: 260 }}>
    <Label htmlFor="lang">Language</Label>
    <Input id="lang" defaultValue="Portuguese" />
  </div>
);

import * as React from "react";
import { Input, Label } from "frontend";

export const Default = () => (
  <div style={{ width: 280 }}>
    <Input placeholder="Search forms…" defaultValue="cuidado" />
  </div>
);

export const WithLabel = () => (
  <div style={{ display: "grid", gap: 6, width: 280 }}>
    <Label htmlFor="proj">Project name</Label>
    <Input id="proj" placeholder="Interview corpus 2026" />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 280 }}>
    <Input disabled placeholder="Read-only" defaultValue="RESP_1" />
  </div>
);

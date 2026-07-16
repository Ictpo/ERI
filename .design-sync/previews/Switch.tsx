import * as React from "react";
import { Label, Switch } from "frontend";

export const States = () => (
  <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Switch defaultChecked />
      <span>Lemmatize</span>
    </label>
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Switch />
      <span>Remove stopwords</span>
    </label>
  </div>
);

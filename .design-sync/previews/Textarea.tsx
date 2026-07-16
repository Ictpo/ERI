import * as React from "react";
import { Label, Textarea } from "frontend";

export const Default = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="doc">Document text</Label>
    <Textarea
      id="doc"
      rows={5}
      defaultValue={
        "No dia_a_dia eu uso as ferramentas de análise para entender o corpus das entrevistas."
      }
    />
  </div>
);

export const CustomStopwords = () => (
  <div style={{ display: "grid", gap: 6, width: 360 }}>
    <Label htmlFor="sw">Custom stopwords</Label>
    <Textarea id="sw" rows={3} placeholder="uh, um, interviewer" />
  </div>
);

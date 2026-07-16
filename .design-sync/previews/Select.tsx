import * as React from "react";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "frontend";

export const Language = () => (
  <div style={{ display: "grid", gap: 6, width: 240 }}>
    <Label>Language</Label>
    <Select defaultValue="pt">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="pt">Portuguese</SelectItem>
        <SelectItem value="fr">French</SelectItem>
        <SelectItem value="es">Spanish</SelectItem>
      </SelectContent>
    </Select>
  </div>
);

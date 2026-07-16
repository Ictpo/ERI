import * as React from "react";
import { Alert } from "frontend";

const titleStyle: React.CSSProperties = { fontWeight: 600, marginBottom: 2 };

export const Info = () => (
  <Alert variant="info" style={{ maxWidth: 480 }}>
    <div style={titleStyle}>Corpus saved</div>
    <div>
      46 documents, 95,020 tokens. You can now run analyses from the center
      pane.
    </div>
  </Alert>
);

export const Warning = () => (
  <Alert variant="warning" style={{ maxWidth: 480 }}>
    <div style={titleStyle}>No text column specified</div>
    <div>
      Using &quot;responses&quot; (longest average content). Pick a different
      column if this is wrong.
    </div>
  </Alert>
);

export const Destructive = () => (
  <Alert variant="destructive" style={{ maxWidth: 480 }}>
    <div style={titleStyle}>Analysis failed</div>
    <div>
      The corpus is too short to segment. Provide more text, or reduce the
      segment size parameter.
    </div>
  </Alert>
);

export const Default = () => (
  <Alert style={{ maxWidth: 480 }}>
    <div style={titleStyle}>Heads up</div>
    <div>
      Underscored words (dia_a_dia) are treated as a single term and skip
      lemmatization.
    </div>
  </Alert>
);

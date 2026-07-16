import * as React from "react";
import { Skeleton } from "frontend";

export const Card = () => (
  <div
    style={{
      display: "grid",
      gap: 10,
      width: 320,
      padding: 16,
      border: "1px solid #e2e8f0",
      borderRadius: 8,
    }}
  >
    <Skeleton style={{ height: 20, width: "60%" }} />
    <Skeleton style={{ height: 14, width: "90%" }} />
    <Skeleton style={{ height: 14, width: "80%" }} />
    <Skeleton style={{ height: 32, width: 120, marginTop: 6 }} />
  </div>
);

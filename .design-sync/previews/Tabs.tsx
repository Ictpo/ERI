import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "frontend";

export const AnalysisTabs = () => (
  <div style={{ width: 420 }}>
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="frequencies">Frequencies</TabsTrigger>
        <TabsTrigger value="cloud">Word cloud</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p style={{ fontSize: 14, color: "#475569", paddingTop: 12 }}>
          2,357 segments · 6 classes · 100% classified.
        </p>
      </TabsContent>
    </Tabs>
  </div>
);

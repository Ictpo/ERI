import * as React from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "frontend";

export const AnalysisCard = () => (
  <Card style={{ width: 360 }}>
    <CardHeader>
      <CardTitle>Reinert classification</CardTitle>
      <CardDescription>
        Cluster text segments into lexical classes using successive
        chi-square bipartitions.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge variant="secondary">2,357 segments</Badge>
        <Badge variant="secondary">6 classes</Badge>
        <Badge variant="success">100% classified</Badge>
      </div>
    </CardContent>
    <CardFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button variant="ghost">Configure</Button>
      <Button>Run analysis</Button>
    </CardFooter>
  </Card>
);

export const ProjectCard = () => (
  <Card style={{ width: 320 }}>
    <CardHeader>
      <CardTitle>Interview corpus 2026</CardTitle>
      <CardDescription>
        46 documents · 95,020 tokens · 5 variables
      </CardDescription>
    </CardHeader>
    <CardFooter>
      <Button variant="outline" size="sm">
        Open project
      </Button>
    </CardFooter>
  </Card>
);

import * as React from "react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "frontend";

export const Default = () => (
  <TooltipProvider>
    <Tooltip open>
      <TooltipTrigger asChild>
        <Button variant="outline">Reset view</Button>
      </TooltipTrigger>
      <TooltipContent>Return the plot to its full extent</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

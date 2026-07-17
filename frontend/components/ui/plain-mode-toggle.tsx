"use client";

import { usePlainMode } from "@/lib/appearance";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Lets a researcher strip brand decoration. Never touches analysis output —
 * see lib/appearance.tsx.
 */
export function PlainModeToggle() {
  const { plain, setPlain } = usePlainMode();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-500">
          <Switch
            checked={plain}
            onCheckedChange={setPlain}
            aria-label="Plain mode — remove decorative styling"
          />
          Plain mode
        </label>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        Removes decorative styling (brand loader animation; variable markers
        become black for maximum contrast). Never changes results, positions or
        the chart palette.
      </TooltipContent>
    </Tooltip>
  );
}

"use client";

import * as React from "react";
import cloud from "d3-cloud";
import { randomLcg } from "d3";
import { Download, Expand, Search } from "lucide-react";
import { TEXT_HUES } from "@/lib/palette";
import { CHART_FONT } from "@/lib/export";
import { ExportDialog } from "./export-dialog";
import { LargeView } from "./large-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";

type CloudWord = { form: string; freq: number };

type PlacedWord = {
  text: string;
  size: number;
  x: number;
  y: number;
  rotate: number;
  color: string;
};

const WIDTH = 760;
const HEIGHT = 480;
// Blank border round the cloud, so no word touches the figure's edge.
const MARGIN = 12;
// Drawn weight; d3-cloud must measure words at it too, or bold words overrun.
const WEIGHT = 600;
// Word-cloud colours encode nothing (they rotate by rank), so only the palette
// hues readable as small text on white are used (TEXT_HUES: blue, black).
// Orange (2.25:1) and sky blue (2.31:1) left a third of the small words
// below AA.
const CLOUD_COLORS = TEXT_HUES;

export function WordCloud({ words }: { words: CloudWord[] }) {
  // The slider spans every word the analysis returned (the launcher's "Max
  // cloud words", capped at 300 by the engine) and starts showing all of them.
  const sliderMax = Math.max(10, Math.ceil(words.length / 5) * 5);
  const [maxWords, setMaxWords] = React.useState(sliderMax);
  const [filter, setFilter] = React.useState("");
  const [placed, setPlaced] = React.useState<PlacedWord[]>([]);
  const [computing, setComputing] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  // Large view: the cloud in a window-sized panel, so small words can be read.
  const [large, setLarge] = React.useState(false);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const selection = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const pool = q ? words.filter((w) => w.form.toLowerCase().includes(q)) : words;
    return pool.slice(0, maxWords);
  }, [words, filter, maxWords]);

  React.useEffect(() => {
    if (selection.length === 0) {
      setPlaced([]);
      return;
    }
    setComputing(true);
    const maxFreq = Math.max(...selection.map((w) => w.freq));
    const minFreq = Math.min(...selection.map((w) => w.freq));
    const scale = (freq: number) => {
      // sqrt scaling into a 12..64px range
      const t =
        maxFreq === minFreq
          ? 1
          : (Math.sqrt(freq) - Math.sqrt(minFreq)) /
            (Math.sqrt(maxFreq) - Math.sqrt(minFreq));
      return 12 + t * 52;
    };

    // Seeded, so the same words and settings always give the same cloud,
    // and a figure used in a draft can be made again for a revision.
    const rng = randomLcg(0.42);
    const layout = cloud()
      .size([WIDTH - 2 * MARGIN, HEIGHT - 2 * MARGIN])
      .words(
        selection.map((w) => ({
          // Strip protection underscores BEFORE layout so the computed
          // bounding box matches what is actually rendered.
          text: w.form.replace(/_+$/, ""),
          size: scale(w.freq),
        }))
      )
      .padding(2)
      .random(rng)
      .rotate(() => (rng() < 0.25 ? 90 : 0))
      .font(CHART_FONT)
      .fontWeight(WEIGHT)
      .fontSize((d) => d.size ?? 12)
      .on("end", (laidOut) => {
        setPlaced(
          laidOut.map((w, i) => ({
            text: w.text ?? "",
            size: w.size ?? 12,
            x: w.x ?? 0,
            y: w.y ?? 0,
            rotate: w.rotate ?? 0,
            color: CLOUD_COLORS[i % CLOUD_COLORS.length],
          }))
        );
        setComputing(false);
      });
    layout.start();
    return () => {
      layout.stop();
    };
  }, [selection]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid min-w-[200px] flex-1 gap-2">
          <Label>
            Max words:{" "}
            <span className="tabular-nums">
              {Math.min(maxWords, words.length)}
            </span>
          </Label>
          <Slider
            aria-label="Max words"
            min={10}
            max={sliderMax}
            step={5}
            value={[maxWords]}
            onValueChange={([v]) => setMaxWords(v)}
          />
        </div>
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Filter words…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setLarge(true)}>
          <Expand /> Large view
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExportOpen(true)}
        >
          <Download /> Download
        </Button>
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        filename="word-cloud"
        getSvg={() => svgRef.current}
        version={`${maxWords}|${filter}|${placed.length}|${computing}`}
      />

      <Card>
        <CardContent className="p-2">
          {selection.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">
              No words match the current filter.
            </p>
          ) : (
            <LargeView open={large} onClose={() => setLarge(false)}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className={large ? "min-h-0 w-full flex-1" : "h-auto w-full"}
              role="img"
              aria-label="Word cloud"
            >
              <g transform={`translate(${WIDTH / 2},${HEIGHT / 2})`}>
                {placed.map((w, i) => (
                  <text
                    key={`${w.text}-${i}`}
                    textAnchor="middle"
                    transform={`translate(${w.x},${w.y}) rotate(${w.rotate})`}
                    fontSize={w.size}
                    fontFamily={CHART_FONT}
                    fontWeight={WEIGHT}
                    fill={w.color}
                    opacity={computing ? 0.35 : 1}
                  >
                    {w.text}
                  </text>
                ))}
              </g>
            </svg>
            </LargeView>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

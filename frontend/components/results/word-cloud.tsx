"use client";

import * as React from "react";
import cloud from "d3-cloud";
import { Download, Search } from "lucide-react";
import { categoryColor } from "@/lib/palette";
import { downloadSvg } from "@/lib/export";
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

export function WordCloud({ words }: { words: CloudWord[] }) {
  const [maxWords, setMaxWords] = React.useState(Math.min(80, words.length));
  const [filter, setFilter] = React.useState("");
  const [placed, setPlaced] = React.useState<PlacedWord[]>([]);
  const [computing, setComputing] = React.useState(false);
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

    const layout = cloud()
      .size([WIDTH, HEIGHT])
      .words(
        selection.map((w) => ({
          text: w.form,
          size: scale(w.freq),
        }))
      )
      .padding(2)
      .rotate(() => (Math.random() < 0.25 ? 90 : 0))
      .font("Inter, system-ui, sans-serif")
      .fontSize((d) => d.size ?? 12)
      .on("end", (laidOut) => {
        setPlaced(
          laidOut.map((w, i) => ({
            text: w.text ?? "",
            size: w.size ?? 12,
            x: w.x ?? 0,
            y: w.y ?? 0,
            rotate: w.rotate ?? 0,
            color: categoryColor(i % 7), // skip pure black rotation-heavy look
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
            Max words: <span className="tabular-nums">{maxWords}</span>
          </Label>
          <Slider
            min={10}
            max={150}
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => svgRef.current && downloadSvg(svgRef.current, "word-cloud")}
        >
          <Download /> SVG
        </Button>
      </div>

      <Card>
        <CardContent className="p-2">
          {selection.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">
              No words match the current filter.
            </p>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-auto w-full"
              role="img"
              aria-label="Word cloud"
            >
              <g transform={`translate(${WIDTH / 2},${HEIGHT / 2})`}>
                {placed.map((w) => (
                  <text
                    key={w.text}
                    textAnchor="middle"
                    transform={`translate(${w.x},${w.y}) rotate(${w.rotate})`}
                    fontSize={w.size}
                    fontFamily="Inter, system-ui, sans-serif"
                    fontWeight={600}
                    fill={w.color}
                    opacity={computing ? 0.35 : 1}
                  >
                    {w.text}
                  </text>
                ))}
              </g>
            </svg>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

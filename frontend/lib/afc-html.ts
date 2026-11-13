/** Self-contained interactive HTML for an AFC map (pure; no external
    resources of any kind, so it works offline from a local file). */
import type { AfcPoint, AfcResult } from "./types";
import { CHART_FONT } from "./export";
import { declutterLabels } from "./declutter";
import { selectWords, type AfcSelectMode } from "./afc-select";

const W = 720;
const H = 520;
const M = { top: 24, right: 24, bottom: 40, left: 48 };
const WORD_COLOR = "#64748b";

export type AfcHtmlOptions = {
  result: AfcResult;
  ax: number;
  ay: number;
  variable: string;
  /** Plain-language analysis settings ("How this was made"). */
  about?: string;
  modalityColor: string;
  mode: AfcSelectMode;
  topN?: number;
  /** Export date, YYYY-MM-DD (default: today). */
  date?: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function axisValue(p: AfcPoint, axis: number): number | null {
  return axis === 0 ? p.x : axis === 1 ? p.y : p.z;
}
function contrib(p: AfcPoint, axis: number): number | null {
  return axis === 0 ? p.contrib_x : axis === 1 ? p.contrib_y : p.contrib_z;
}
const f3 = (v: number | null) => (v === null ? "—" : v.toFixed(3));
const f1 = (v: number | null) => (v === null ? "—" : v.toFixed(1));
const cleanWord = (s: string) => s.replace(/_+$/, "");
const r2 = (v: number) => Math.round(v * 100) / 100;

export function buildAfcHtml(o: AfcHtmlOptions): string {
  const { result, ax, ay, variable, modalityColor } = o;
  const date = o.date ?? new Date().toISOString().slice(0, 10);
  const inX = result.explained[ax] ?? 0;
  const inY = result.explained[ay] ?? 0;
  const sel = selectWords({
    rows: result.rows,
    ax,
    ay,
    inertiaX: inX,
    inertiaY: inY,
    mode: o.mode,
    topN: o.topN,
  });

  type Item = { p: AfcPoint; kind: "word" | "modality"; idx: number; vx: number; vy: number };
  const items: Item[] = [];
  result.rows.forEach((p, idx) => {
    const vx = axisValue(p, ax);
    const vy = axisValue(p, ay);
    if (vx !== null && vy !== null) items.push({ p, kind: "word", idx, vx, vy });
  });
  result.cols.forEach((p, idx) => {
    const vx = axisValue(p, ax);
    const vy = axisValue(p, ay);
    if (vx !== null && vy !== null) items.push({ p, kind: "modality", idx, vx, vy });
  });

  // Same scales as the on-screen and printed maps: aspect ratio 1.
  const xs = items.map((i) => i.vx);
  const ys = items.map((i) => i.vy);
  const xe = xs.length ? [Math.min(...xs), Math.max(...xs)] : [-1, 1];
  const ye = ys.length ? [Math.min(...ys), Math.max(...ys)] : [-1, 1];
  const padX = (xe[1] - xe[0] || 1) * 0.08;
  const padY = (ye[1] - ye[0] || 1) * 0.08;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const unit = Math.min(
    plotW / (xe[1] - xe[0] + 2 * padX),
    plotH / (ye[1] - ye[0] + 2 * padY)
  );
  const cx = (xe[0] + xe[1]) / 2;
  const cy = (ye[0] + ye[1]) / 2;
  const sx = (v: number) => M.left + (v - (cx - plotW / unit / 2)) * unit;
  const sy = (v: number) => H - M.bottom - (v - (cy - plotH / unit / 2)) * unit;

  // Label offsets for the labelled set at zoom 1 (selected words + modalities).
  const labelled = items.filter((i) => i.kind === "modality" || sel.ids.has(i.idx));
  const text = (i: Item) => (i.kind === "word" ? cleanWord(i.p.label) : i.p.label);
  const placed = declutterLabels(
    labelled.map((i) => ({
      px: sx(i.vx),
      py: sy(i.vy),
      kind: i.kind,
      text: text(i),
      priority: (contrib(i.p, ax) ?? 0) + (contrib(i.p, ay) ?? 0),
    })),
    2,
    W,
    H,
    { keepAll: true, maxShift: 40 }
  );
  const placeOf = new Map<Item, (typeof placed)[number]>();
  labelled.forEach((i, k) => placeOf.set(i, placed[k]));

  const nodes = items
    .map((i) => {
      const px = sx(i.vx);
      const py = sy(i.vy);
      const word = i.kind === "word";
      const pl = placeOf.get(i);
      const isSel = !word || sel.ids.has(i.idx);
      const dx = pl ? r2(pl.lx - px) : word ? 5 : 8;
      const dy = pl ? r2(pl.ly - py) : word ? 3 : 4;
      const lead = pl && pl.displaced ? `${r2(pl.ax - px)},${r2(pl.ay - py)}` : "";
      const tip = [
        `${text(i)} (${word ? "word" : `value of ${variable || "the variable"}`})`,
        `Axis ${ax + 1}: ${f3(i.vx)}   Axis ${ay + 1}: ${f3(i.vy)}`,
        `Contribution: axis ${ax + 1} ${f1(contrib(i.p, ax))}%   axis ${ay + 1} ${f1(contrib(i.p, ay))}%`,
        word ? `Used ${i.p.freq} times` : `${i.p.freq} words in documents with this value`,
      ].join("\n");
      const marker = word
        ? `<circle r="3" fill="${WORD_COLOR}" fill-opacity="0.7"/>`
        : `<path d="M0,-5.5 L5.5,0 L0,5.5 L-5.5,0 Z" fill="${modalityColor}"/>`;
      const label = `<text class="lab" x="${dx}" y="${dy}" font-size="${word ? 9 : 11}"${
        word ? "" : ' font-weight="700"'
      } fill="${word ? WORD_COLOR : modalityColor}"${isSel ? "" : ' display="none"'}>${esc(text(i))}</text>`;
      const leadAttrs = lead
        ? ` x2="${lead.split(",")[0]}" y2="${lead.split(",")[1]}"`
        : ' display="none"';
      return `<g class="pt ${word ? "w" : "m"}" tabindex="0" data-px="${r2(px)}" data-py="${r2(py)}" data-sel="${
        isSel ? 1 : 0
      }" data-dx="${dx}" data-dy="${dy}" data-lead="${lead}" data-tip="${esc(tip)}" transform="translate(${r2(
        px
      )},${r2(py)})"><line class="lead" stroke="${word ? WORD_COLOR : modalityColor}" stroke-width="0.8"${leadAttrs}/>${marker}${label}</g>`;
    })
    .join("\n");

  const title = `Correspondence analysis — ${variable || "variable"} — axes ${ax + 1} × ${ay + 1}`;
  const pct = (v: number) => `${v.toFixed(1)}%`;

  const wordRows = result.rows
    .map((p, idx) => {
      const w = cleanWord(p.label);
      return `<tr data-q="${esc(w.toLowerCase())}"><th scope="row">${esc(w)}</th><td data-v="${axisValue(p, ax) ?? ""}">${f3(
        axisValue(p, ax)
      )}</td><td data-v="${axisValue(p, ay) ?? ""}">${f3(axisValue(p, ay))}</td><td data-v="${contrib(p, ax) ?? ""}">${f1(
        contrib(p, ax)
      )}</td><td data-v="${contrib(p, ay) ?? ""}">${f1(contrib(p, ay))}</td><td data-v="${p.freq}">${p.freq}</td><td>${
        sel.ids.has(idx) ? "yes" : "no"
      }</td></tr>`;
    })
    .join("\n");
  const modRows = result.cols
    .map(
      (p) =>
        `<tr><th scope="row">${esc(p.label)}</th><td>${f3(axisValue(p, ax))}</td><td>${f3(axisValue(p, ay))}</td><td>${f1(
          contrib(p, ax)
        )}</td><td>${f1(contrib(p, ay))}</td><td>${p.freq}</td></tr>`
    )
    .join("\n");

  const css = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#211619;font-family:${CHART_FONT};line-height:1.45}
main{max-width:980px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:1.3rem;margin:0 0 4px}
h2{font-size:1.05rem;margin:28px 0 8px}
.sub,.how,.rule{color:#4a3b36;font-size:.88rem;margin:2px 0}
.bar{display:flex;gap:6px;align-items:center;margin:12px 0 6px;flex-wrap:wrap}
button{font:inherit;font-size:.85rem;border:1px solid #b9a9a1;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer}
button:hover{background:#f6efea}
input[type=search]{font:inherit;font-size:.85rem;border:1px solid #b9a9a1;border-radius:6px;padding:4px 8px;min-width:220px}
.frame{border:1px solid #d9cdc6;border-radius:6px;position:relative}
svg#map{display:block;width:100%;height:auto;touch-action:none;cursor:grab;user-select:none}
svg#map.drag{cursor:grabbing}
svg text{font-family:${CHART_FONT};pointer-events:none}
.pt{outline:none}
.pt:focus circle,.pt:focus path{stroke:#000;stroke-width:1.5}
#tip{position:absolute;display:none;pointer-events:none;background:#fff;border:1px solid #b9a9a1;border-radius:6px;padding:6px 9px;font-size:.78rem;box-shadow:0 2px 8px rgba(0,0,0,.15);max-width:320px;z-index:2}
#tip b{display:block}
.key{display:flex;gap:16px;align-items:center;font-size:.82rem;color:#4a3b36;margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:.82rem}
th,td{border-bottom:1px solid #e8dfd9;padding:4px 8px;text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}
thead th{background:#f6efea;position:sticky;top:0;cursor:pointer}
.scroll{max-height:420px;overflow:auto;border:1px solid #d9cdc6;border-radius:6px}
`;

  const js = `
(function(){
var svg=document.getElementById('map'),tip=document.getElementById('tip'),frame=document.getElementById('frame');
var L=${M.left},R=${W - M.right},T=${M.top},B=${H - M.bottom},W=${W},H=${H};
var pts=[].slice.call(svg.querySelectorAll('.pt'));
var hl=document.getElementById('ax-h'),vl=document.getElementById('ax-v');
var ox=+svg.getAttribute('data-ox'),oy=+svg.getAttribute('data-oy');
var k=1,tx=0,ty=0;
function apply(){
  var all=k>=2.5;
  pts.forEach(function(p){
    var x=+p.getAttribute('data-px')*k+tx,y=+p.getAttribute('data-py')*k+ty;
    var inView=x>=L-12&&x<=R+12&&y>=T-12&&y<=B+12;
    p.setAttribute('display',inView?'inline':'none');
    if(!inView)return;
    p.setAttribute('transform','translate('+x.toFixed(1)+','+y.toFixed(1)+')');
    var sel=p.getAttribute('data-sel')==='1',lab=p.querySelector('.lab'),ld=p.querySelector('.lead');
    var w=p.classList.contains('w');
    lab.setAttribute('display',(sel||all)?'inline':'none');
    if(all){lab.setAttribute('x',w?5:8);lab.setAttribute('y',w?3:4);ld.setAttribute('display','none');}
    else{lab.setAttribute('x',p.getAttribute('data-dx'));lab.setAttribute('y',p.getAttribute('data-dy'));
      var l=p.getAttribute('data-lead');if(l){var q=l.split(',');ld.setAttribute('x2',q[0]);ld.setAttribute('y2',q[1]);ld.setAttribute('display','inline');}else ld.setAttribute('display','none');}
  });
  var hy=oy*k+ty,vx=ox*k+tx;
  hl.setAttribute('y1',hy);hl.setAttribute('y2',hy);hl.setAttribute('display',hy>=T&&hy<=B?'inline':'none');
  vl.setAttribute('x1',vx);vl.setAttribute('x2',vx);vl.setAttribute('display',vx>=L&&vx<=R?'inline':'none');
  document.getElementById('zoomv').textContent=(Math.round(k*10)/10)+'\\u00d7';
}
function pos(e){var r=svg.getBoundingClientRect();return [(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height];}
function zoomAt(mx,my,nk){nk=Math.max(1,Math.min(60,nk));tx=mx-(mx-tx)*nk/k;ty=my-(my-ty)*nk/k;k=nk;if(k===1){tx=0;ty=0;}apply();}
svg.addEventListener('wheel',function(e){e.preventDefault();var p=pos(e);zoomAt(p[0],p[1],k*Math.exp(-e.deltaY*0.0015));},{passive:false});
var drag=null;
function hide(){tip.style.display='none';}
svg.addEventListener('pointerdown',function(e){drag={x:e.clientX,y:e.clientY,tx:tx,ty:ty};svg.classList.add('drag');try{svg.setPointerCapture(e.pointerId);}catch(_){}});
svg.addEventListener('pointermove',function(e){
  if(drag){var r=svg.getBoundingClientRect();tx=drag.tx+(e.clientX-drag.x)*W/r.width;ty=drag.ty+(e.clientY-drag.y)*H/r.height;apply();hide();}
});
function end(){drag=null;svg.classList.remove('drag');}
svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
document.getElementById('zin').onclick=function(){zoomAt((L+R)/2,(T+B)/2,k*1.6);};
document.getElementById('zout').onclick=function(){zoomAt((L+R)/2,(T+B)/2,k/1.6);};
document.getElementById('reset').onclick=function(){k=1;tx=0;ty=0;apply();};
function show(p){
  var lines=p.getAttribute('data-tip').split('\\n');tip.textContent='';
  lines.forEach(function(s,i){var d=document.createElement(i?'div':'b');d.textContent=s;tip.appendChild(d);});
  tip.style.display='block';
  var fr=frame.getBoundingClientRect(),sr=svg.getBoundingClientRect(),t=p.getAttribute('transform');
  var x=(+t.match(/translate\\(([-\\d.]+)/)[1])*sr.width/W+(sr.left-fr.left);
  var y=(+t.match(/,([-\\d.]+)\\)/)[1])*sr.height/H+(sr.top-fr.top);
  var tw=tip.offsetWidth,th=tip.offsetHeight;
  tip.style.left=Math.max(4,Math.min(fr.width-tw-4,x-tw/2))+'px';
  tip.style.top=Math.max(4,y<fr.height/2?y+14:y-th-14)+'px';
}
pts.forEach(function(p){
  p.addEventListener('mouseenter',function(){if(!drag)show(p);});
  p.addEventListener('mouseleave',hide);
  p.addEventListener('focus',function(){show(p);});
  p.addEventListener('blur',hide);
});
var q=document.getElementById('q'),rows=[].slice.call(document.querySelectorAll('#words tbody tr'));
q.addEventListener('input',function(){var s=q.value.toLowerCase();rows.forEach(function(r){r.style.display=r.getAttribute('data-q').indexOf(s)>=0?'':'none';});});
var heads=[].slice.call(document.querySelectorAll('#words thead th')),asc={};
heads.forEach(function(h,c){h.addEventListener('click',function(){
  asc[c]=!asc[c];var tb=document.querySelector('#words tbody');
  rows.sort(function(a,b){
    var x=a.children[c],y=b.children[c],vx=x.getAttribute('data-v'),vy=y.getAttribute('data-v'),r;
    if(vx!==null&&vy!==null&&vx!==''&&vy!=='')r=parseFloat(vx)-parseFloat(vy);else r=x.textContent.localeCompare(y.textContent);
    return asc[c]?r:-r;});
  rows.forEach(function(r){tb.appendChild(r);});
});});
apply();
})();
`;

  const keySvg = (shape: string) =>
    `<svg width="12" height="12" viewBox="-6 -6 12 12" style="display:inline;width:12px;height:12px;cursor:default">${shape}</svg>`;
  const modLabel = variable ? `${variable} values` : "variable values";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
<main>
<h1>${esc(title)}</h1>
<p class="sub">Axis ${ax + 1}: ${pct(inX)} of the inertia · Axis ${ay + 1}: ${pct(inY)} of the inertia</p>
<p class="how"><b>How this was made:</b> ${esc(o.about || "ERI correspondence analysis")} · exported ${esc(date)}</p>
<p class="rule">${esc(sel.rule)}</p>
<div class="bar">
<button id="zin" type="button" aria-label="Zoom in">+</button>
<button id="zout" type="button" aria-label="Zoom out">−</button>
<button id="reset" type="button">Reset</button>
<span class="sub">Zoom <span id="zoomv">1×</span> · scroll to zoom, drag to pan, hover or Tab to a dot for its values. Zoom past 2.5× to label every word in view.</span>
</div>
<div class="frame" id="frame">
<svg id="map" viewBox="0 0 ${W} ${H}" role="group" aria-label="Correspondence analysis map" data-ox="${r2(sx(0))}" data-oy="${r2(sy(0))}">
<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>
<clipPath id="clip"><rect x="${M.left}" y="${M.top}" width="${plotW}" height="${plotH}"/></clipPath>
<line id="ax-h" x1="${M.left}" x2="${W - M.right}" y1="${r2(sy(0))}" y2="${r2(sy(0))}" stroke="#64748b" stroke-width="0.75" stroke-dasharray="4 3"/>
<line id="ax-v" x1="${r2(sx(0))}" x2="${r2(sx(0))}" y1="${M.top}" y2="${H - M.bottom}" stroke="#64748b" stroke-width="0.75" stroke-dasharray="4 3"/>
<text x="${W - M.right}" y="${H - 12}" text-anchor="end" font-size="12" fill="${WORD_COLOR}">Axis ${ax + 1} (${inX.toFixed(1)}%)</text>
<text x="16" y="${M.top}" font-size="12" fill="${WORD_COLOR}" transform="rotate(-90 16 ${M.top})" text-anchor="end">Axis ${ay + 1} (${inY.toFixed(1)}%)</text>
<g clip-path="url(#clip)">
${nodes}
</g>
</svg>
<div id="tip" role="status"></div>
</div>
<p class="key"><span>${keySvg(`<circle r="3" fill="${WORD_COLOR}" fill-opacity="0.7"/>`)} words</span><span>${keySvg(
    `<path d="M0,-5.5 L5.5,0 L0,5.5 L-5.5,0 Z" fill="${modalityColor}"/>`
  )} <b style="color:${modalityColor}">${esc(modLabel)}</b></span></p>
<h2>Every word</h2>
<p class="sub"><label>Search: <input id="q" type="search" placeholder="type a word"></label> · click a column heading to sort</p>
<div class="scroll">
<table id="words">
<thead><tr><th scope="col">Word</th><th scope="col">Axis ${ax + 1} coord.</th><th scope="col">Axis ${ay + 1} coord.</th><th scope="col">Contribution axis ${ax + 1} (%)</th><th scope="col">Contribution axis ${ay + 1} (%)</th><th scope="col">Frequency</th><th scope="col">Shown in printed figure</th></tr></thead>
<tbody>
${wordRows}
</tbody>
</table>
</div>
<h2>${esc(variable ? `${variable} values` : "Variable values")}</h2>
<div class="scroll">
<table>
<thead><tr><th scope="col">Value</th><th scope="col">Axis ${ax + 1} coord.</th><th scope="col">Axis ${ay + 1} coord.</th><th scope="col">Contribution axis ${ax + 1} (%)</th><th scope="col">Contribution axis ${ay + 1} (%)</th><th scope="col">Words</th></tr></thead>
<tbody>
${modRows}
</tbody>
</table>
</div>
</main>
<script>${js}</script>
</body>
</html>
`;
}

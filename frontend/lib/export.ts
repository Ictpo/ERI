/**
 * SVG export helper: serialize an SVG node with inline styles and trigger
 * a Blob download.
 */

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
] as const;

function inlineStyles(source: Element, target: Element) {
  if (target instanceof SVGElement || target instanceof HTMLElement) {
    const computed = window.getComputedStyle(source);
    let styleText = "";
    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value) styleText += `${prop}:${value};`;
    }
    target.setAttribute("style", styleText);
  }
  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  for (let i = 0; i < sourceChildren.length; i++) {
    if (targetChildren[i]) inlineStyles(sourceChildren[i], targetChildren[i]);
  }
}

export function downloadSvg(svgEl: SVGSVGElement, filename: string) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  inlineStyles(svgEl, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  if (!clone.getAttribute("width") && svgEl.clientWidth) {
    clone.setAttribute("width", String(svgEl.clientWidth));
    clone.setAttribute("height", String(svgEl.clientHeight));
  }
  // White background rect so the export is not transparent.
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);

  const markup = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${markup}`], {
    type: "image/svg+xml;charset=utf-8",
  });
  downloadBlob(blob, filename.endsWith(".svg") ? filename : `${filename}.svg`);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

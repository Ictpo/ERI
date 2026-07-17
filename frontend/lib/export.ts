/**
 * SVG export pipeline: build a print-ready clone of a live SVG, serialize
 * it, and download as SVG or rasterized PNG.
 *
 * Conventions understood by the clone builder:
 *   [data-export-ignore]  element is stripped from exports (selection rings…)
 *   [data-zoom-group]     transform is reset so exports show the FULL drawing,
 *                         never the current pan/zoom viewport
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

export type ExportClone = { markup: string; width: number; height: number };

/** Build a cleaned, standalone SVG document string from a live SVG node. */
export function buildExportClone(svgEl: SVGSVGElement): ExportClone {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  inlineStyles(svgEl, clone);

  // Strip interactive artifacts so exports are print-ready.
  clone.querySelectorAll("[data-export-ignore]").forEach((el) => el.remove());
  clone.querySelectorAll("text").forEach((t) => {
    t.removeAttribute("text-decoration");
    if (t.style.textDecoration) t.style.textDecoration = "";
  });
  clone.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));
  // Exports always show the full drawing, not the current pan/zoom state.
  clone
    .querySelectorAll("[data-zoom-group]")
    .forEach((el) => el.removeAttribute("transform"));

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // Export at the logical (viewBox) size, not the CSS-scaled on-screen size.
  let width = svgEl.clientWidth || 800;
  let height = svgEl.clientHeight || 600;
  const vb = svgEl.getAttribute("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      width = parts[2];
      height = parts[3];
    }
  }
  clone.setAttribute("width", String(Math.round(width)));
  clone.setAttribute("height", String(Math.round(height)));

  // White background so the export is not transparent.
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    bg.setAttribute("x", String(parts[0]));
    bg.setAttribute("y", String(parts[1]));
    bg.setAttribute("width", String(parts[2]));
    bg.setAttribute("height", String(parts[3]));
  } else {
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
  }
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);

  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  return { markup, width, height };
}

export function svgBlob(markup: string): Blob {
  return new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
}

/** Rasterize an export-ready SVG string to a PNG blob. */
export function svgToPngBlob(
  markup: string,
  width: number,
  height: number,
  scale = 2
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Cap the bitmap so huge spread factors can't explode memory.
    const cap = 6000;
    const s = Math.min(scale, cap / Math.max(width, height, 1));
    const url = URL.createObjectURL(svgBlob(markup));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * s));
        canvas.height = Math.max(1, Math.round(height * s));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas context");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error("PNG encoding failed"));
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not render SVG for rasterization"));
    };
    img.src = url;
  });
}

/** One-shot SVG download (no preview) — kept for programmatic use. */
export function downloadSvg(svgEl: SVGSVGElement, filename: string) {
  const { markup } = buildExportClone(svgEl);
  downloadBlob(
    svgBlob(markup),
    filename.endsWith(".svg") ? filename : `${filename}.svg`
  );
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000; // avoid arg-count limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, sub as unknown as number[]);
  }
  return btoa(binary);
}

type NativeSave = (name: string, dataB64: string, ext: string) => Promise<boolean>;

/** The native save bridge, present only inside the desktop (pywebview) app. */
function nativeSave(): NativeSave | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { pywebview?: { api?: { save_file?: NativeSave } } })
    .pywebview?.api;
  return api?.save_file ? api.save_file.bind(api) : null;
}

export async function downloadBlob(blob: Blob, filename: string) {
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot + 1) : "";

  // Desktop app: route through the native Save dialog so the file type is
  // enforced. The browser's blob download uses an "All files" dialog, so
  // retyping the name (e.g. "X") drops the extension → a formatless file.
  const save = nativeSave();
  if (save && ext) {
    try {
      const b64 = arrayBufferToBase64(await blob.arrayBuffer());
      await save(filename, b64, ext);
      return;
    } catch {
      // fall through to the browser download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // In the native (pywebview/WebView2) window the blob is only read AFTER
  // the user finishes the Save As dialog — revoking after 1 s produced
  // empty files whenever choosing a filename took longer than that.
  // Keep the URL alive long enough for any save dialog.
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
}

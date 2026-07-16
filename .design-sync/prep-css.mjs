// Prepares ERI's compiled Tailwind CSS for the design-sync bundle.
// Runs from frontend/ (buildCmd). Next.js emits @font-face rules with
// /_next/static/media/... URLs that cannot resolve in the bundle, so:
//  - copy the woff2 files into .design-sync/assets/
//  - write inter.css with the @font-face rules rewritten to local URLs
//  - write .ds-styles.css = compiled app CSS minus those @font-face rules
import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const cssDir = "out/_next/static/css";
const mediaDir = "out/_next/static/media";
const assets = "../.design-sync/assets";
mkdirSync(assets, { recursive: true });

let css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n");

const fontFaces = [];
css = css.replace(/@font-face\{[^}]*\}/g, (block) => {
  const rewritten = block.replace(
    /url\(\/_next\/static\/media\/([^)]+?)(\.p)?\.woff2\)/g,
    (_m, name, p) => {
      const file = `${name}${p ?? ""}.woff2`;
      try {
        copyFileSync(join(mediaDir, file), join(assets, file));
      } catch {
        /* font file absent — leave URL as-is so validate flags it */
        return _m;
      }
      return `url(./${file})`;
    }
  );
  fontFaces.push(rewritten);
  return ""; // strip from the main sheet
});

// The app applies Inter via a next/font body class that designs built with
// the DS never receive — apply the family globally from the font sheet
// itself so every consumer gets ERI's typography.
const families = [...new Set(
  fontFaces
    .map((b) => /font-family:\s*['"]?([^;'"]+)['"]?/.exec(b)?.[1])
    .filter(Boolean)
)];
const primary = families.find((f) => !/fallback/i.test(f));
const fallback = families.find((f) => /fallback/i.test(f));
const stack = [primary, fallback]
  .filter(Boolean)
  .map((f) => `'${f}'`)
  .concat(["system-ui", "sans-serif"])
  .join(", ");
const bodyRule = primary ? `\nbody { font-family: ${stack}; }\n` : "\n";

writeFileSync(join(assets, "inter.css"), fontFaces.join("\n") + bodyRule);
writeFileSync(".ds-styles.css", css);
console.log(
  `prep-css: ${fontFaces.length} @font-face rules -> inter.css (body stack: ${stack}); main css ${css.length}B -> .ds-styles.css`
);

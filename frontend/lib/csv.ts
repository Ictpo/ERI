/** Most frequent of , ; and tab in the header record (outside quotes); ',' on
    a tie or a single column. Mirrors backend corpus_parse._detect_separator. */
function detectSeparator(text: string, start: number): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === "\n" || ch === "\r") break;
      if (ch in counts) counts[ch]++;
    }
  }
  let best = ",";
  for (const sep of [";", "\t"]) if (counts[sep] > counts[best]) best = sep;
  return best;
}

/**
 * Tiny RFC-4180-ish CSV header parser: reads the first record (handling
 * quoted fields, embedded separators/newlines) and returns the column names.
 * The separator is ',', ';' (pt-BR Excel) or tab — see detectSeparator.
 */
export function parseCsvHeader(text: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const sep = detectSeparator(text, i);

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === sep) {
      fields.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      break; // end of header record
    }
    field += ch;
    i++;
  }
  fields.push(field);
  return fields.map((f) => f.trim()).filter((f) => f.length > 0);
}

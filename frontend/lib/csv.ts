/**
 * Tiny RFC-4180-ish CSV header parser: reads the first record (handling
 * quoted fields, embedded commas/newlines) and returns the column names.
 */
export function parseCsvHeader(text: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) i = 1;

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
    if (ch === ",") {
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

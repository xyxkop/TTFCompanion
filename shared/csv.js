/**
 * TTF Companion - CSV tokenizer (ES module).
 * Splits raw CSV text into rows of fields, handling quoted fields
 * (with "" escaping) and \r\n / \n line endings.
 */
export function parseCSVLines(text) {
  const lines = [];
  let current = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\r' && next === '\n') { current.push(field); field = ''; lines.push(current); current = []; i++; }
      else if (ch === '\n') { current.push(field); field = ''; lines.push(current); current = []; }
      else { field += ch; }
    }
  }
  if (field || current.length > 0) { current.push(field); lines.push(current); }
  return lines;
}

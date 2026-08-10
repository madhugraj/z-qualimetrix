// ---------------------------------------------------------------------------
// Client-side report export helpers (CSV / JSON / print-to-PDF).
// No backend required — everything is generated from in-memory report data.
// ---------------------------------------------------------------------------

export type Row = Record<string, string | number | null | undefined>;

function escapeCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ];
  return lines.join("\n");
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportCsv(name: string, rows: Row[]) {
  download(`${name}-${stamp()}.csv`, toCsv(rows), "text/csv");
}

export function exportJson(name: string, data: unknown) {
  download(`${name}-${stamp()}.json`, JSON.stringify(data, null, 2), "application/json");
}

/** Downloads an arbitrary text document (used by the document hub). */
export function exportText(filename: string, content: string) {
  download(filename, content, "text/markdown");
}


/** Uses the browser print dialog — "Save as PDF" produces a shareable report. */
export function exportPdf() {
  window.print();
}

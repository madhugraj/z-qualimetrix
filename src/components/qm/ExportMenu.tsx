import { Download, FileJson, FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCsv, exportJson, exportPdf, type Row } from "@/lib/qm-export";

export interface ExportDataset {
  key: string;
  label: string;
  rows: Row[];
}

/**
 * Takes the caller's already-fetched rows as a prop rather than importing
 * any data itself — this used to read from src/lib/qm-data.ts's mock
 * arrays regardless of what the page actually rendered, so "Export report"
 * silently downloaded fake numbers. Now it can only export what's on screen.
 */
export function ExportMenu({ datasets }: { datasets: ExportDataset[] }) {
  const nonEmpty = datasets.filter((d) => d.rows.length > 0);

  const csv = (key: string, label: string, rows: Row[]) => {
    exportCsv(key, rows);
    toast.success(`${label} exported as CSV`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="glass flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:text-primary"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.7} /> Export report
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px]">Download CSV</DropdownMenuLabel>
        {nonEmpty.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Nothing to export yet.</div>
        ) : (
          nonEmpty.map((d) => (
            <DropdownMenuItem key={d.key} onSelect={() => csv(d.key, d.label, d.rows)}>
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> {d.label}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={nonEmpty.length === 0}
          onSelect={() => {
            exportJson(
              "qualimetrix-report",
              Object.fromEntries(nonEmpty.map((d) => [d.key, d.rows])),
            );
            toast.success("Full report bundle exported as JSON");
          }}
        >
          <FileJson className="mr-2 h-3.5 w-3.5" /> Full bundle (JSON)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportPdf()}>
          <Printer className="mr-2 h-3.5 w-3.5" /> Print / save as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
import { EXECUTION_TREND, MTTR_TREND, RTM, VELOCITY_TREND, BOTTLENECKS } from "@/lib/qm-data";
import { BUGS } from "@/lib/qm-bugs";

const DATASETS: { key: string; label: string; rows: () => Row[] }[] = [
  { key: "test-execution", label: "Test execution outcomes", rows: () => EXECUTION_TREND as Row[] },
  { key: "mttr", label: "Resolution efficiency (MTTR)", rows: () => MTTR_TREND as Row[] },
  { key: "velocity", label: "Quality velocity", rows: () => VELOCITY_TREND as Row[] },
  { key: "rtm", label: "Requirements traceability", rows: () => RTM as unknown as Row[] },
  { key: "bottlenecks", label: "QA bottlenecks", rows: () => BOTTLENECKS as unknown as Row[] },
  {
    key: "bugs",
    label: "Classified defects",
    rows: () =>
      BUGS.map((b) => ({
        id: b.id,
        title: b.title,
        domain: b.domain ?? "",
        confidence: Math.round((b.confidence ?? 0) * 100),
        severity: b.severity,
        status: b.status,
        module: b.module,
        assignee: b.assignee,
      })),
  },
];

export function ExportMenu() {
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
        {DATASETS.map((d) => (
          <DropdownMenuItem key={d.key} onSelect={() => csv(d.key, d.label, d.rows())}>
            <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> {d.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            exportJson(
              "qualimetrix-report",
              Object.fromEntries(DATASETS.map((d) => [d.key, d.rows()])),
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

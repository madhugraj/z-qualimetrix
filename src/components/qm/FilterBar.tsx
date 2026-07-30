import { PRODUCTS, SPRINTS } from "@/lib/qm-data";

function Pill({ label, options }: { label: string; options: string[] }) {
  return (
    <label className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select className="cursor-pointer bg-transparent text-xs font-medium outline-none">
        {options.map((o) => (
          <option key={o} className="bg-popover text-popover-foreground">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill label="Product" options={["All products", ...PRODUCTS]} />
      <Pill label="Sprint" options={SPRINTS} />
      <Pill label="Team" options={["All teams", "Squad Nova", "Squad Kite", "Squad Pulse"]} />
      <Pill label="Range" options={["Last 30 days", "Last 7 days", "This quarter", "YTD"]} />
    </div>
  );
}

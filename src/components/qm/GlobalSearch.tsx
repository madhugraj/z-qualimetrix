import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { BUGS } from "@/lib/qm-bugs";
import { DEVELOPERS } from "@/lib/qm-people";
import { DELIVERABLES, RTM } from "@/lib/qm-data";

const PAGES = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Bug Intelligence", to: "/bugs" },
  { label: "Engineering Health", to: "/engineering-health" },
  { label: "Reports", to: "/reports" },
  { label: "Integrations", to: "/integrations" },
  { label: "Manual Log", to: "/manual-log" },
  { label: "Settings", to: "/settings" },
] as const;

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex h-9 min-w-[180px] items-center gap-2 rounded-full px-3 text-xs text-muted-foreground transition-colors hover:text-foreground md:min-w-[280px]"
        aria-label="Search QualiMetrix"
      >
        <Search className="h-4 w-4" strokeWidth={1.6} />
        <span className="flex-1 text-left">Search bugs, people, stories…</span>
        <kbd className="hidden rounded border border-glass-border px-1.5 py-0.5 text-[10px] md:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search bugs, people, stories, deliverables, pages…" />
        <CommandList>
          <CommandEmpty>No matches found.</CommandEmpty>

          <CommandGroup heading="Bugs">
            {BUGS.map((bug) => (
              <CommandItem
                key={bug.id}
                value={`${bug.id} ${bug.title} ${bug.module} ${bug.domain} ${bug.assignee}`}
                onSelect={() =>
                  go(() => navigate({ to: "/bugs/$bugId", params: { bugId: bug.id } }))
                }
              >
                <span className="font-medium">{bug.id}</span>
                <span className="truncate text-muted-foreground">{bug.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="People">
            {DEVELOPERS.map((dev) => (
              <CommandItem
                key={dev.id}
                value={`${dev.name} ${dev.role} ${dev.squad}`}
                onSelect={() => go(() => navigate({ to: "/engineering-health" }))}
              >
                <span className="font-medium">{dev.name}</span>
                <span className="truncate text-muted-foreground">{dev.role}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Stories">
            {RTM.map((row) => (
              <CommandItem
                key={row.story}
                value={`${row.story} ${row.title ?? ""}`}
                onSelect={() => go(() => navigate({ to: "/reports" }))}
              >
                <span className="font-medium">{row.story}</span>
                <span className="truncate text-muted-foreground">{row.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Deliverables">
            {DELIVERABLES.slice(0, 6).map((d) => (
              <CommandItem
                key={d.title}
                value={`${d.type} ${d.title} ${d.author ?? ""}`}
                onSelect={() => go(() => navigate({ to: "/manual-log" }))}
              >
                <span className="font-medium">{d.type}</span>
                <span className="truncate text-muted-foreground">{d.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Pages">
            {PAGES.map((page) => (
              <CommandItem
                key={page.to}
                value={page.label}
                onSelect={() => go(() => navigate({ to: page.to }))}
              >
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

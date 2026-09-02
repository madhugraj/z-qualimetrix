import { Copy } from "lucide-react";
import { type Bug } from "@/lib/qm-bugs";
import { cn } from "@/lib/utils";
import type { SimilarBugRow } from "@/lib/queries/analytics";

export function DomainBadge({ bug }: { bug: Bug }) {
  return (
    <span className="rounded-full border border-glass-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {bug.domain}
    </span>
  );
}

const footerCopy = (
  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
    Matches are scored by similarity between title and description — a higher score means a more
    likely duplicate before a developer picks it up.
  </p>
);

interface SimilarBugsProps {
  /** Real matches for a real, most-recently-updated bug in the current product. */
  hasData?: boolean;
  matches?: SimilarBugRow[];
  isLoading?: boolean;
}

export function SimilarBugs({ hasData, matches, isLoading }: SimilarBugsProps) {
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading…</p>;
  }

  if (!hasData || !matches) {
    return (
      <p className="text-xs text-muted-foreground">
        No similar-bug data yet — this project may not have any bugs tracked, or nothing's synced yet.
      </p>
    );
  }

  return (
    <div>
      {matches.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No close matches found — this looks like a genuinely new defect.
        </p>
      ) : (
        <ul className="space-y-2">
          {matches.map((match) => {
            const strong = match.score > 0.35;
            return (
              <li
                key={match.id}
                className="flex items-start gap-3 rounded-xl border border-glass-border p-3"
              >
                <Copy
                  className={cn("mt-0.5 h-4 w-4 shrink-0", strong ? "text-critical" : "text-warning")}
                  strokeWidth={1.6}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {match.externalId ?? match.id} · {match.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{match.status}</p>
                </div>
                <span
                  className={cn("shrink-0 text-xs font-semibold", strong ? "text-critical" : "text-warning")}
                >
                  {Math.round(match.score * 100)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {footerCopy}
    </div>
  );
}

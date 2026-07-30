import { Copy } from "lucide-react";
import { BUGS, findSimilarBugs, type Bug } from "@/lib/qm-bugs";
import { cn } from "@/lib/utils";

export function DomainBadge({ bug }: { bug: Bug }) {
  return (
    <span className="rounded-full border border-glass-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {bug.domain}
    </span>
  );
}

export function SimilarBugs({ bug, limit = 3 }: { bug: Bug; limit?: number }) {
  const matches = findSimilarBugs(bug, BUGS, limit);

  return (
    <div>
      <div className="rounded-xl border border-glass-border p-3">
        <p className="text-xs font-medium">{bug.id} · {bug.title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{bug.description}</p>
      </div>

      {matches.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No close matches found — this looks like a genuinely new defect.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {matches.map(({ bug: match, score }) => {
            const strong = score > 0.35;
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
                    {match.id} · {match.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {match.status} · {match.module} · {match.assignee}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold",
                    strong ? "text-critical" : "text-warning",
                  )}
                >
                  {Math.round(score * 100)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Matches are scored with tf-idf cosine similarity over title, description and module. Anything
        above 35% is flagged as a likely duplicate before a developer picks it up.
      </p>
    </div>
  );
}

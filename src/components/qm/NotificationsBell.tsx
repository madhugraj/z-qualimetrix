import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bell, Check, Info, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ALERTS, SEVERITY_STYLE, type AlertSeverity } from "@/lib/qm-alerts";
import { cn } from "@/lib/utils";

const ICON: Record<AlertSeverity, typeof Bell> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

export function NotificationsBell() {
  const [read, setRead] = useState<string[]>([]);
  const unread = ALERTS.filter((a) => !read.includes(a.id));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="glass relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Notifications (${unread.length} unread)`}
        >
          <Bell className="h-4 w-4" strokeWidth={1.6} />
          {unread.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass w-[340px] rounded-2xl p-0">
        <header className="flex items-center justify-between border-b border-glass-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Alerts</p>
            <p className="text-[11px] text-muted-foreground">
              {unread.length} unread · quality &amp; team signals
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRead(ALERTS.map((a) => a.id))}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Check className="h-3 w-3" /> Mark all read
          </button>
        </header>

        <ul className="max-h-[360px] overflow-y-auto p-2">
          {ALERTS.map((alert) => {
            const Icon = ICON[alert.severity];
            const isRead = read.includes(alert.id);
            return (
              <li key={alert.id}>
                <Link
                  to={alert.to}
                  params={alert.params as never}
                  onClick={() => setRead((r) => (r.includes(alert.id) ? r : [...r, alert.id]))}
                  className={cn(
                    "flex gap-3 rounded-xl p-3 transition-colors hover:bg-accent/40",
                    isRead && "opacity-55",
                  )}
                >
                  <Icon
                    className={cn("mt-0.5 h-4 w-4 shrink-0", SEVERITY_STYLE[alert.severity])}
                    strokeWidth={1.7}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{alert.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {alert.detail}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{alert.time}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

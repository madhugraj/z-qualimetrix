import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bell, Check, Info, ShieldAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationSeverity,
} from "@/lib/queries/notifications";
import { cn } from "@/lib/utils";

const ICON: Record<NotificationSeverity, typeof Bell> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_STYLE: Record<NotificationSeverity, string> = {
  critical: "text-critical",
  warning: "text-warning",
  info: "text-ops",
};

export function NotificationsBell() {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const alerts = data?.alerts ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="glass relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <Bell className="h-4 w-4" strokeWidth={1.6} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass w-[340px] rounded-2xl p-0">
        <header className="flex items-center justify-between border-b border-glass-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Alerts</p>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount} unread · quality &amp; team signals
            </p>
          </div>
          <button
            type="button"
            onClick={() => markAllRead.mutate(alerts.map((a) => a.id))}
            disabled={alerts.length === 0 || markAllRead.isPending}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Check className="h-3 w-3" /> Mark all read
          </button>
        </header>

        <ul className="max-h-[360px] overflow-y-auto p-2">
          {isLoading && (
            <li className="p-3 text-center text-[11px] text-muted-foreground">Loading…</li>
          )}
          {!isLoading && alerts.length === 0 && (
            <li className="p-3 text-center text-[11px] text-muted-foreground">
              No alerts right now — you're all caught up.
            </li>
          )}
          {alerts.map((alert) => {
            const Icon = ICON[alert.severity];
            return (
              <li key={alert.id}>
                <Link
                  to={alert.to}
                  params={alert.params as never}
                  onClick={() => !alert.isRead && markRead.mutate(alert.id)}
                  className={cn(
                    "flex gap-3 rounded-xl p-3 transition-colors hover:bg-accent/40",
                    alert.isRead && "opacity-55",
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

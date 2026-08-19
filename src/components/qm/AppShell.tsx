import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bot,
  Bug,
  Users,
  LayoutDashboard,
  PlugZap,
  PenLine,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { GlobalSearch } from "@/components/qm/GlobalSearch";
import { NotificationsBell } from "@/components/qm/NotificationsBell";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

// `roles` gates each destination for real: undefined means every signed-in
// role sees it. Integrations and Settings are PM-only (raw credentials and
// role/delegation administration live there). Engineering Health is
// leadership/PM only, matching this app's manager/lead/HR intent.
const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/bugs", label: "Bug Intelligence", icon: Bug },
  { to: "/ai-usage", label: "AI Usage & Tokens", icon: Bot },
  { to: "/engineering-health", label: "Engineering Health", icon: Users, roles: ["pm", "executive"] },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/integrations", label: "Integrations", icon: PlugZap, roles: ["pm"] },
  { to: "/manual-log", label: "Manual Log", icon: PenLine },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["pm"] },
] as const;



export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const nav = NAV.filter(
    (item) => !("roles" in item) || (item.roles as readonly string[]).includes(user?.role ?? ""),
  );

  return (
    <div className="flex min-h-screen">
      <aside className="glass sticky top-0 z-20 hidden h-screen w-[76px] flex-col items-center gap-1 rounded-none border-y-0 border-l-0 py-5 md:flex">
        <Link to="/dashboard" className="mb-6 flex flex-col items-center gap-1" aria-label="QubeIQ home">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60">
            <span className="text-xs font-bold text-primary-foreground">Q</span>
          </div>
        </Link>
        {nav.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={cn(
                "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              <item.icon
                className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_var(--primary)]")}
                strokeWidth={1.5}
              />
              {active && (
                <span className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_12px_var(--primary)]" />
              )}
              <span className="glass pointer-events-none absolute left-14 z-30 rounded-lg px-2 py-1 text-xs whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100">
                {item.label}
              </span>
            </Link>
          );
        })}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="glass sticky top-0 z-20 flex items-center gap-2 rounded-none border-x-0 border-t-0 px-3 py-2 md:px-7 md:py-3">
          <GlobalSearch />
          <div className="ml-auto">
            <NotificationsBell />
          </div>
        </div>
        <nav className="glass flex gap-1 overflow-x-auto rounded-none border-x-0 border-t-0 px-3 py-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs whitespace-nowrap",
                pathname === item.to
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}


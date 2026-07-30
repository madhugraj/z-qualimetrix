import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bug,
  HeartPulse,
  LayoutDashboard,
  PlugZap,
  PenLine,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import yavarLogo from "@/assets/yavar-logo.png.asset.json";
import { cn } from "@/lib/utils";

// `roles` documents the RBAC gate for each destination; Engineering Health is
// limited to managers / leads / HR once auth is wired.
const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/bugs", label: "Bug Intelligence", icon: Bug },
  { to: "/engineering-health", label: "Engineering Health", icon: HeartPulse },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/integrations", label: "Integrations", icon: PlugZap },
  { to: "/manual-log", label: "Manual Log", icon: PenLine },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen">
      <aside className="glass sticky top-0 z-20 hidden h-screen w-[76px] flex-col items-center gap-1 rounded-none border-y-0 border-l-0 py-5 md:flex">
        <Link to="/" className="mb-6 flex flex-col items-center gap-1" aria-label="YAVAR home">
          <img
            src={yavarLogo.url}
            alt="YAVAR logo"
            className="h-8 w-[54px] rounded-lg object-contain mix-blend-multiply"
          />
        </Link>
        {NAV.map((item) => {
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
        <nav className="glass sticky top-0 z-20 flex gap-1 overflow-x-auto rounded-none border-x-0 border-t-0 px-3 py-2 md:hidden">
          {NAV.map((item) => (
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

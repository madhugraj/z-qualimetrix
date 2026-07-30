import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassPanelProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function GlassPanel({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
}: GlassPanelProps) {
  return (
    <section className={cn("glass glass-hover rounded-3xl p-5", className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

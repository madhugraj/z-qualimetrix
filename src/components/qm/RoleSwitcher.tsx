import { ROLES, type Role } from "@/lib/qm-data";
import { cn } from "@/lib/utils";

export function RoleSwitcher({
  role,
  onChange,
}: {
  role: Role;
  onChange: (role: Role) => void;
}) {
  return (
    <div className="glass flex flex-wrap gap-1 rounded-full p-1">
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onChange(r.id)}
          title={r.blurb}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
            role === r.id
              ? "bg-primary text-primary-foreground shadow-[0_0_18px_-4px_var(--primary)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

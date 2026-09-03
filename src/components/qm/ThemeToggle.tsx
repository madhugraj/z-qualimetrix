import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="tablist"
      aria-label="App theme"
      className={cn(
        "gloss flex shrink-0 items-center gap-0.5 rounded-full p-1 text-xs font-semibold",
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={theme === "glass"}
        onClick={() => setTheme("glass")}
        className={cn(
          "rounded-full px-3 py-1.5 transition-colors",
          theme === "glass" ? "gloss-cta" : "text-muted-foreground hover:text-primary",
        )}
      >
        Glass
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={theme === "yavar"}
        onClick={() => setTheme("yavar")}
        className={cn(
          "rounded-full px-3 py-1.5 transition-colors",
          theme === "yavar" ? "gloss-cta" : "text-muted-foreground hover:text-primary",
        )}
      >
        Yavar
      </button>
    </div>
  );
}

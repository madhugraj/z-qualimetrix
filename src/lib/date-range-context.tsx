import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

export type RangeKey = "last7" | "last30" | "quarter" | "ytd";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "last30", label: "Last 30 days" },
  { key: "last7", label: "Last 7 days" },
  { key: "quarter", label: "This quarter" },
  { key: "ytd", label: "YTD" },
];

interface DateRangeContextValue {
  range: RangeKey;
  setRange: (range: RangeKey) => void;
  startDate: Date;
  endDate: Date;
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

function computeStartDate(range: RangeKey, now: Date): Date {
  switch (range) {
    case "last7":
      return new Date(now.getTime() - 7 * 86_400_000);
    case "last30":
      return new Date(now.getTime() - 30 * 86_400_000);
    case "quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), quarterStartMonth, 1);
    }
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
  }
}

function storageKey(userId: string): string {
  return `qm_selected_range_${userId}`;
}

function isRangeKey(value: string | null): value is RangeKey {
  return value === "last7" || value === "last30" || value === "quarter" || value === "ytd";
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [range, setRangeState] = useState<RangeKey>(() => {
    if (!userId) return "last30";
    const stored = localStorage.getItem(storageKey(userId));
    return isRangeKey(stored) ? stored : "last30";
  });

  const setRange = useCallback(
    (next: RangeKey) => {
      setRangeState(next);
      if (userId) localStorage.setItem(storageKey(userId), next);
    },
    [userId]
  );

  // Computed once per render, not memoized against a ticking clock — a
  // multi-day-range filter doesn't need to recompute mid-session as time
  // passes, only when the user actually changes the selection.
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    return { startDate: computeStartDate(range, now), endDate: now };
  }, [range]);

  return (
    <DateRangeContext.Provider value={{ range, setRange, startDate, endDate }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange(): DateRangeContextValue {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within a DateRangeProvider");
  return ctx;
}

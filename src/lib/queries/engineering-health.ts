import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface DeveloperHealthProfile {
  id: string;
  name: string;
  squad: string | null;
  role: string;
  avatarInitials: string;
  hasActivityData: boolean;
  activityBreakdown: { githubCommits: number; jiraTransitions: number };
  afterHoursPct: number | null;
  weekendActivityCount: number | null;
  weekendActivityPct: number | null;
  p0p1Load: number;
  burnoutIndex: number | null;
}

interface DeveloperHealthResult {
  developers: DeveloperHealthProfile[];
  burnoutFormula: string;
}

async function fetchDeveloperHealth(): Promise<DeveloperHealthResult> {
  const res = await apiFetch("/engineering-health/developers");
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? "Failed to load developer health profiles");
  }
  return body.data as DeveloperHealthResult;
}

export function useDeveloperHealthProfiles() {
  return useQuery({
    queryKey: ["engineering-health-developers"],
    queryFn: fetchDeveloperHealth,
  });
}

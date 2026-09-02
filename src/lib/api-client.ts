import { API_V1_URL } from "@/lib/api-config";

/**
 * Access tokens are short-lived (15 min) by design, so a session refresh
 * during normal use is expected, not exceptional — silently retry once via
 * the refresh cookie before surfacing a 401 to the caller. Concurrent 401s
 * (several panels fetching on mount) share one in-flight refresh instead of
 * each racing their own.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_V1_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * fetch() against the API with credentials + one automatic refresh-and-retry
 * on a 401. Only redirects to /login if the refresh itself fails, meaning
 * the refresh token (30-day) is also gone — a real re-auth, not routine TTL.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${API_V1_URL}${path}`;
  const doFetch = () => fetch(url, { ...init, credentials: "include" });

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await doFetch();
    } else if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      // Already on /login means there was never a session to begin with
      // (e.g. AuthProvider's own /auth/me check on first load) — redirecting
      // to /login from /login is a full-page reload that remounts
      // AuthProvider, which immediately repeats this exact 401-then-refresh-
      // fail sequence, looping forever. Only redirect when actually leaving
      // an authenticated page after the session dies.
      window.location.href = "/login";
    }
  }
  return res;
}

export { API_V1_URL as API_BASE_URL };

// Named api-config (not api) to avoid confusion with the separate src/api/
// directory, which is the actual Express backend source, not frontend config.

const CONFIGURED_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
// A secure browser must never call an HTTP API, even if a stale build argument
// accidentally supplied one. Falling back to same-origin routes through the
// web server's internal API proxy below; SSR and local HTTP development retain
// the direct localhost default.
const IS_SECURE_BROWSER =
  typeof window !== "undefined" && window.location.protocol === "https:";
const RAW = IS_SECURE_BROWSER && CONFIGURED_URL?.startsWith("http://")
  ? ""
  : CONFIGURED_URL || "http://localhost:3001";

export const API_BASE_URL = RAW.replace(/\/+$/, "");
export const API_V1_URL = `${API_BASE_URL}/api/v1`;

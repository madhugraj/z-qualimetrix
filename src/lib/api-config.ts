// Named api-config (not api) to avoid confusion with the separate src/api/
// directory, which is the actual Express backend source, not frontend config.

const RAW = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://qubeiq.yavar.ai/api";

export const API_BASE_URL = RAW.replace(/\/+$/, "");
export const API_V1_URL = `${API_BASE_URL}/api/v1`;

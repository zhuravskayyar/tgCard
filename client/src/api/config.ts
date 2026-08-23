export function getApiEndpoint(path: string) {
  const isLocalDevelopment = import.meta.env.DEV
    && typeof window !== "undefined"
    && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const apiBaseUrl = isLocalDevelopment
    ? ""
    : import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "") ?? "";
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

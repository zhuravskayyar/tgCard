export function getApiEndpoint(path: string) {
  const isLocalDevelopment = typeof window !== "undefined"
    && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const isPermanentMiniApp = typeof window !== "undefined"
    && window.location.hostname === "app.cardastika.org";
  const apiBaseUrl = isLocalDevelopment || isPermanentMiniApp
    ? ""
    : import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "") ?? "";
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

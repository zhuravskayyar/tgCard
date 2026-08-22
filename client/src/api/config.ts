export function getApiEndpoint(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "") ?? "";
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

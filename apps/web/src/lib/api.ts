const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
function csrf() {
  return (
    document.cookie
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("entitlementci_csrf="))
      ?.split("=")[1] ?? ""
  );
}
export async function api<T = any>(path: string, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (method !== "GET" && method !== "HEAD")
    headers.set("x-csrf-token", csrf());
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      body?.error?.message ?? `Request failed with ${res.status}`,
    );
  return body as T;
}

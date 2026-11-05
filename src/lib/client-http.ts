let scope = "";
let epoch = 0;
export const clientRequestEpoch = () => epoch;
let accountRequests = new AbortController();
export const setClientScope = (value: string) => {
  if (value !== scope) {
    epoch++;
    accountRequests.abort();
    accountRequests = new AbortController();
  }
  scope = value;
};
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const sent = scope;
  const signal = init?.signal
    ? AbortSignal.any([init.signal, accountRequests.signal])
    : accountRequests.signal;
  const response = await fetch(input, { ...init, signal });
  if (typeof window !== "undefined") {
    if (sent && sent !== scope)
      throw new DOMException("Obsolete authenticated request", "AbortError");
    if (response.status === 401) {
      window.dispatchEvent(new Event("p3h-session-ended"));
    }
    const returned = response.headers.get("X-P3H-Access");
    if (sent && returned && returned !== sent) {
      window.dispatchEvent(new Event("p3h-access-changed"));
      throw new DOMException("Permissions changed", "AbortError");
    }
  }
  return response;
}

import axios from "axios"

/**
 * Returns true when the API base URL targets a public ngrok hostname (free tier interstitial).
 */
export function isNgrokTunnelHost(apiBaseUrl: string): boolean {
  const u = apiBaseUrl.toLowerCase()
  return (
    u.includes("ngrok-free.app") ||
    u.includes(".ngrok.app") ||
    u.includes(".ngrok.io")
  )
}

/**
 * Headers required so ngrok-free skips the browser warning page (that response has no CORS headers).
 */
export function ngrokBypassRequestHeaders(
  apiBaseUrl: string,
): Record<string, string> {
  return isNgrokTunnelHost(apiBaseUrl)
    ? { "ngrok-skip-browser-warning": "true" }
    : {}
}

/**
 * Applies ngrok bypass headers on the shared axios instance used by ad-hoc requests (e.g. rbacApi).
 */
export function syncNgrokBypassAxiosDefaults(apiBaseUrl: string): void {
  const key = "ngrok-skip-browser-warning"
  if (isNgrokTunnelHost(apiBaseUrl)) {
    axios.defaults.headers.common[key] = "true"
  } else {
    delete axios.defaults.headers.common[key]
  }
}

import { OpenAPI } from "@/client"

/**
 * Turns a stored API path (e.g. /static/...) or absolute URL into a full URL for <img src>.
 */
export function resolveBackendMediaUrl(pathOrUrl: string): string {
  if (!pathOrUrl) {
    return ""
  }
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl
  }
  const base = OpenAPI.BASE.replace(/\/$/, "")
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`
  return `${base}${path}`
}

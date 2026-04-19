import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

/**
 * Map HTTP API base URL to WebSocket scheme and host (same rules as chat).
 */
function toWsBase(httpBase: string) {
  if (httpBase.startsWith("https://"))
    return `wss://${httpBase.slice("https://".length)}`
  if (httpBase.startsWith("http://"))
    return `ws://${httpBase.slice("http://".length)}`
  return httpBase
}

/**
 * Build authenticated URL for the task-scoped realtime WebSocket.
 */
export function buildTaskWsUrl(taskId: string) {
  const token = encodeURIComponent(getAccessToken() || "")
  const base = toWsBase(OpenAPI.BASE)
  return `${base}/api/v1/tasks/ws?task_id=${encodeURIComponent(taskId)}&token=${token}`
}

/**
 * Build authenticated URL for the global task notification WebSocket.
 */
export function buildTaskGlobalWsUrl() {
  const token = encodeURIComponent(getAccessToken() || "")
  const base = toWsBase(OpenAPI.BASE)
  return `${base}/api/v1/tasks/ws/global?token=${token}`
}

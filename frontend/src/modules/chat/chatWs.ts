import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export type ChatWsEvent =
  | { type: "presence.join"; room_id: string; user_id: string }
  | { type: "presence.leave"; room_id: string; user_id: string }
  | { type: "pong" }
  | { type: "error"; code: string; detail: string }
  | {
      type: "message.new"
      message: {
        id: string
        room_id: string
        sender_id: string
        message_type: string
        content: string | null
        created_at: string | null
      }
    }

function toWsBase(httpBase: string) {
  if (httpBase.startsWith("https://"))
    return `wss://${httpBase.slice("https://".length)}`
  if (httpBase.startsWith("http://"))
    return `ws://${httpBase.slice("http://".length)}`
  return httpBase
}

export function buildChatWsUrl(roomId: string) {
  const token = encodeURIComponent(getAccessToken() || "")
  const base = toWsBase(OpenAPI.BASE)
  return `${base}/api/v1/chat/ws?room_id=${encodeURIComponent(roomId)}&token=${token}`
}

export function connectChatWs(params: {
  roomId: string
  onEvent: (evt: ChatWsEvent) => void
  onStatus?: (s: "connecting" | "open" | "closed" | "error") => void
}) {
  const ws = new WebSocket(buildChatWsUrl(params.roomId))
  params.onStatus?.("connecting")

  ws.onopen = () => {
    params.onStatus?.("open")
  }
  ws.onclose = () => {
    params.onStatus?.("closed")
  }
  ws.onerror = () => {
    params.onStatus?.("error")
  }
  ws.onmessage = (m) => {
    try {
      params.onEvent(JSON.parse(m.data) as ChatWsEvent)
    } catch {
      // ignore
    }
  }

  return {
    ws,
    sendMessage: (content: string) => {
      ws.send(JSON.stringify({ type: "message.send", content }))
    },
    ping: () => {
      ws.send(JSON.stringify({ type: "ping" }))
    },
    close: () => ws.close(),
  }
}

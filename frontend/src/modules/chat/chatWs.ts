import { OpenAPI } from "@/client"
import { refreshSession } from "@/modules/auth/authSession"
import { getAccessToken, getRefreshToken } from "@/modules/auth/tokenStore"

export type ChatWsEvent =
  | { type: "presence.join"; room_id: string; user_id: string }
  | { type: "presence.leave"; room_id: string; user_id: string }
  | { type: "pong" }
  | { type: "server_ping" }
  | { type: "subscribed"; room_id: string }
  | { type: "unsubscribed"; room_id: string }
  | { type: "error"; code: string; detail: string; room_id?: string }
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

export type ChatWsStatus = "idle" | "connecting" | "open" | "closed" | "error"

type RoomListener = (evt: ChatWsEvent) => void
type StatusListener = (s: ChatWsStatus) => void

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]
const ACCESS_TOKEN_LEEWAY_S = 60
const PENDING_QUEUE_MAX = 50
const PENDING_TTL_MS = 30_000

function toWsBase(httpBase: string) {
  if (httpBase.startsWith("https://"))
    return `wss://${httpBase.slice("https://".length)}`
  if (httpBase.startsWith("http://"))
    return `ws://${httpBase.slice("http://".length)}`
  return httpBase
}

function buildChatWsUrl() {
  const token = encodeURIComponent(getAccessToken() || "")
  const base = toWsBase(OpenAPI.BASE)
  // ngrok-skip-browser-warning is for HTTP interstitial bypass only —
  // ngrok does not show an interstitial for WebSocket upgrades, and
  // including the param can cause ngrok to reject the WS upgrade.
  return `${base}/api/v1/chat/ws?token=${token}`
}

function decodeJwtExp(token: string | null): number | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
    const payload = JSON.parse(atob(padded)) as { exp?: number }
    return typeof payload.exp === "number" ? payload.exp : null
  } catch {
    return null
  }
}

async function ensureFreshAccessToken(): Promise<void> {
  const token = getAccessToken()
  const exp = decodeJwtExp(token)
  const now = Math.floor(Date.now() / 1000)
  if (exp && exp - now > ACCESS_TOKEN_LEEWAY_S) return
  if (!getRefreshToken()) return
  try {
    await refreshSession()
  } catch {
    // Let the WS open attempt fail naturally; reconnect loop will retry.
  }
}

// --- module state -----------------------------------------------------------

let lastWsUrl = ""
let lastCloseCode = 0
let lastCloseReason = ""

let socket: WebSocket | null = null
let status: ChatWsStatus = "idle"
let connecting = false
let connectPromise: Promise<void> | null = null
let retryCount = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let reconnectEpoch = 0

const roomSubs = new Map<string, Set<RoomListener>>()
const subscribedRooms = new Set<string>()
const statusListeners = new Set<StatusListener>()

interface PendingSend {
  payload: unknown
  enqueuedAt: number
}
const pendingSends: PendingSend[] = []

let domListenersAttached = false

function setStatus(next: ChatWsStatus) {
  if (status === next) return
  status = next
  for (const fn of statusListeners) {
    try {
      fn(next)
    } catch {
      // ignore listener errors
    }
  }
}

export function getStatus(): ChatWsStatus {
  return status
}

export function onStatusChange(fn: StatusListener): () => void {
  statusListeners.add(fn)
  return () => {
    statusListeners.delete(fn)
  }
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function sendRaw(payload: unknown): boolean {
  const ws = socket
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }
  return false
}

function flushPending() {
  if (!pendingSends.length) return
  const now = Date.now()
  const survivors: PendingSend[] = []
  for (const item of pendingSends) {
    if (now - item.enqueuedAt > PENDING_TTL_MS) continue
    if (!sendRaw(item.payload)) survivors.push(item)
  }
  pendingSends.length = 0
  pendingSends.push(...survivors)
}

function queueSend(payload: unknown) {
  if (sendRaw(payload)) return
  if (pendingSends.length >= PENDING_QUEUE_MAX) {
    pendingSends.shift()
  }
  pendingSends.push({ payload, enqueuedAt: Date.now() })
  // Kick off a connection if we don't have one in flight.
  void ensureSocket()
}

function resubscribeRooms() {
  for (const roomId of subscribedRooms) {
    sendRaw({ type: "subscribe", room_id: roomId })
  }
}

function extractRoomId(evt: ChatWsEvent): string | null {
  if (evt.type === "message.new") return evt.message.room_id
  if (
    evt.type === "presence.join" ||
    evt.type === "presence.leave" ||
    evt.type === "subscribed" ||
    evt.type === "unsubscribed"
  )
    return evt.room_id
  if (evt.type === "error" && typeof evt.room_id === "string") return evt.room_id
  return null
}

function dispatchEvent(evt: ChatWsEvent) {
  const roomId = extractRoomId(evt)
  if (roomId) {
    const listeners = roomSubs.get(roomId)
    if (listeners) {
      for (const fn of listeners) {
        try {
          fn(evt)
        } catch {
          // ignore listener errors
        }
      }
    }
    return
  }
  // Connection-level events without a room (pong / server_ping / generic error)
  // fan out to every room listener so UIs can react if needed.
  for (const listeners of roomSubs.values()) {
    for (const fn of listeners) {
      try {
        fn(evt)
      } catch {
        // ignore
      }
    }
  }
}

function scheduleReconnect() {
  if (retryTimer) return
  if (!roomSubs.size && !pendingSends.length) {
    // Nothing to keep the socket alive for.
    setStatus("idle")
    return
  }
  const delay = RECONNECT_DELAYS[Math.min(retryCount, RECONNECT_DELAYS.length - 1)]
  retryCount += 1
  const epoch = reconnectEpoch
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (epoch !== reconnectEpoch) return
    void ensureSocket()
  }, delay)
}

async function openSocket(): Promise<void> {
  await ensureFreshAccessToken()
  // Attach DOM listeners only now — after the async refresh — so that
  // focus/visibilitychange events that fired during the await don't race
  // with socket creation (probeOrReconnect already guards via `connecting`).
  attachDomListeners()

  const wsUrl = buildChatWsUrl()
  lastWsUrl = wsUrl.replace(/token=[^&]+/, "token=***")
  console.log("[chatWs] opening socket to", lastWsUrl)

  return new Promise<void>((resolve, reject) => {
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch (err) {
      console.error("[chatWs] WebSocket constructor threw", err)
      reject(err)
      return
    }
    socket = ws
    setStatus("connecting")

    // If the handshake doesn't complete in 10s, kill the socket and retry.
    const connectTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.warn("[chatWs] handshake timeout — forcing close")
        lastCloseCode = 4000
        lastCloseReason = "connect timeout"
        ws.close()
      }
    }, 10_000)

    let settled = false

    ws.onopen = () => {
      console.log("[chatWs] onopen")
      clearTimeout(connectTimeout)
      retryCount = 0
      setStatus("open")
      resubscribeRooms()
      flushPending()
      if (!settled) {
        settled = true
        resolve()
      }
    }
    ws.onmessage = (m) => {
      try {
        const evt = JSON.parse(m.data) as ChatWsEvent
        if (evt && evt.type === "server_ping") {
          sendRaw({ type: "pong" })
          return
        }
        dispatchEvent(evt)
      } catch {
        // ignore malformed payloads
      }
    }
    ws.onerror = (e) => {
      console.error("[chatWs] onerror", e)
      lastCloseCode = -1
      lastCloseReason = "onerror"
      setStatus("error")
    }
    ws.onclose = (e) => {
      clearTimeout(connectTimeout)
      console.warn("[chatWs] onclose code=", e.code, "reason=", e.reason, "wasClean=", e.wasClean)
      lastCloseCode = e.code
      lastCloseReason = e.reason || ""
      const wasUs = socket === ws
      if (wasUs) socket = null
      setStatus("closed")
      if (!settled) {
        settled = true
        reject(new Error("WebSocket closed before open"))
      }
      if (wasUs) scheduleReconnect()
    }
  })
}

async function ensureSocket(): Promise<void> {
  if (socket && socket.readyState === WebSocket.OPEN) return
  if (connecting && connectPromise) return connectPromise
  if (socket && socket.readyState === WebSocket.CONNECTING && connectPromise)
    return connectPromise

  connecting = true
  connectPromise = openSocket()
    .catch(() => {
      // openSocket rejects on close-before-open; reconnect already scheduled.
    })
    .finally(() => {
      connecting = false
      connectPromise = null
    })
  return connectPromise
}

// --- iOS PWA recovery -------------------------------------------------------

function isSocketUsable(): boolean {
  return !!socket && socket.readyState === WebSocket.OPEN
}

function isSocketConnecting(): boolean {
  return !!socket && socket.readyState === WebSocket.CONNECTING
}

function forceReconnect() {
  reconnectEpoch += 1
  clearRetryTimer()
  retryCount = 0
  if (socket) {
    try {
      socket.close()
    } catch {
      // ignore
    }
    socket = null
  }
  // Abandon any in-flight openSocket attempt so ensureSocket starts fresh.
  connecting = false
  connectPromise = null
  void ensureSocket()
}

let probeTimer: ReturnType<typeof setTimeout> | null = null
function probeOrReconnect() {
  if (!roomSubs.size) return
  // A handshake (or token refresh) in flight is not a zombie; let it complete.
  if (connecting || isSocketConnecting()) return
  if (!isSocketUsable()) {
    forceReconnect()
    return
  }
  // Send a ping; if no pong arrives in 3s, reconnect.
  const epoch = reconnectEpoch
  sendRaw({ type: "ping" })
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = setTimeout(() => {
    probeTimer = null
    if (epoch !== reconnectEpoch) return
    forceReconnect()
  }, 3000)
}

function handleVisibility() {
  if (typeof document === "undefined") return
  if (document.visibilityState !== "visible") return
  probeOrReconnect()
}

function handlePageShow(e: PageTransitionEvent) {
  if (e.persisted) {
    // BFCache restore — the socket is definitely dead.
    forceReconnect()
  }
  // Non-persisted pageshow fires on initial load too; nothing to recover.
}

function handleFocus() {
  probeOrReconnect()
}

function handleOnline() {
  probeOrReconnect()
}

function attachDomListeners() {
  if (domListenersAttached) return
  if (typeof document === "undefined" || typeof window === "undefined") return
  document.addEventListener("visibilitychange", handleVisibility)
  window.addEventListener("pageshow", handlePageShow)
  window.addEventListener("focus", handleFocus)
  window.addEventListener("online", handleOnline)
  domListenersAttached = true
}

function detachDomListenersIfIdle() {
  if (!domListenersAttached) return
  if (roomSubs.size > 0) return
  if (typeof document === "undefined" || typeof window === "undefined") return
  document.removeEventListener("visibilitychange", handleVisibility)
  window.removeEventListener("pageshow", handlePageShow)
  window.removeEventListener("focus", handleFocus)
  window.removeEventListener("online", handleOnline)
  domListenersAttached = false
}

// --- public API -------------------------------------------------------------

export function subscribeRoom(
  roomId: string,
  onEvent: RoomListener,
): () => void {
  let listeners = roomSubs.get(roomId)
  if (!listeners) {
    listeners = new Set()
    roomSubs.set(roomId, listeners)
  }
  listeners.add(onEvent)

  const wasSubscribed = subscribedRooms.has(roomId)
  subscribedRooms.add(roomId)

  void ensureSocket().then(() => {
    if (!subscribedRooms.has(roomId)) return
    if (!wasSubscribed || !isSocketUsable()) {
      sendRaw({ type: "subscribe", room_id: roomId })
    }
  })
  // Also attempt an immediate send if already open (covers the
  // already-subscribed-but-new-listener case being a no-op above).
  if (!wasSubscribed && isSocketUsable()) {
    sendRaw({ type: "subscribe", room_id: roomId })
  }

  return () => {
    const set = roomSubs.get(roomId)
    if (!set) return
    set.delete(onEvent)
    if (set.size === 0) {
      roomSubs.delete(roomId)
      subscribedRooms.delete(roomId)
      sendRaw({ type: "unsubscribe", room_id: roomId })
      if (roomSubs.size === 0) {
        // No more interest — let the socket drain and close.
        if (socket && socket.readyState === WebSocket.OPEN) {
          try {
            socket.close()
          } catch {
            // ignore
          }
        }
        detachDomListenersIfIdle()
      }
    }
  }
}

export function getDebugInfo() {
  return {
    url: lastWsUrl,
    status,
    readyState: socket?.readyState ?? -1,
    closeCode: lastCloseCode,
    closeReason: lastCloseReason,
    retryCount,
    rooms: [...subscribedRooms],
  }
}

export function sendChatMessage(roomId: string, content: string): boolean {
  const payload = { type: "message.send", room_id: roomId, content }
  if (sendRaw(payload)) return true
  queueSend(payload)
  return false
}

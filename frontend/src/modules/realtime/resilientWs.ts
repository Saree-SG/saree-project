import { refreshSession } from "@/modules/auth/authSession"
import { getAccessToken, getRefreshToken } from "@/modules/auth/tokenStore"

/**
 * Resilient WebSocket client for the task realtime channels (task-scoped and
 * global). Wraps a raw WebSocket with the survival behaviour mobile/iOS PWAs
 * need — the raw `new WebSocket` the task sockets used before had none of this,
 * so once iOS suspended the tab the socket became a zombie and the user silently
 * stopped receiving updates until a full reload.
 *
 * What it adds:
 *  - reconnect with capped backoff,
 *  - access-token refresh before every (re)connect (token can expire while the
 *    device sleeps; the URL embeds the token, so we rebuild it each attempt),
 *  - connect-handshake timeout,
 *  - periodic keepalive ping so idle proxies don't drop the connection,
 *  - active probe on visibilitychange / focus / online / pageshow: send a ping,
 *    and if no pong arrives within 3s treat the socket as dead and reconnect.
 *
 * The task WS keepalive protocol is raw text: client sends `"ping"`, server
 * replies `"pong"` (see backend `run_task_ws_receive_loop`). Event frames are
 * JSON `{ event, task_id, data }`.
 */

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]
const ACCESS_TOKEN_LEEWAY_S = 60
const CONNECT_TIMEOUT_MS = 10_000
const PROBE_TIMEOUT_MS = 3000
const DEFAULT_KEEPALIVE_MS = 25_000

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
    // Let the open attempt fail naturally; the reconnect loop will retry.
  }
}

export interface ResilientWsOptions {
  /** Rebuilt on every (re)connect so the freshest token is embedded. */
  buildUrl: () => string
  /** Called with each parsed JSON event frame. */
  onEvent: (msg: {
    event?: string
    task_id?: string
    data?: Record<string, string | undefined>
  }) => void
  /** Notified when the open/closed state flips. */
  onOpenChange?: (open: boolean) => void
  /** Keepalive ping interval (ms). Default 25s. */
  keepaliveMs?: number
}

export class ResilientWebSocket {
  private opts: ResilientWsOptions
  private socket: WebSocket | null = null
  private stopped = false
  private connecting = false
  private retryCount = 0
  private epoch = 0
  private lastPongAt = 0

  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private probeTimer: ReturnType<typeof setTimeout> | null = null
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private domAttached = false

  constructor(opts: ResilientWsOptions) {
    this.opts = opts
  }

  start(): void {
    this.stopped = false
    this.attachDomListeners()
    void this.ensureSocket()
  }

  stop(): void {
    this.stopped = true
    this.epoch += 1
    this.clearTimers()
    this.detachDomListeners()
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // ignore
      }
      this.socket = null
    }
    this.opts.onOpenChange?.(false)
  }

  private isUsable(): boolean {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN
  }

  private isConnecting(): boolean {
    return (
      this.connecting ||
      (!!this.socket && this.socket.readyState === WebSocket.CONNECTING)
    )
  }

  private sendRaw(text: string): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(text)
        return true
      } catch {
        return false
      }
    }
    return false
  }

  private clearTimers(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
    if (this.probeTimer) {
      clearTimeout(this.probeTimer)
      this.probeTimer = null
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }

  private startKeepalive(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer)
    const interval = this.opts.keepaliveMs ?? DEFAULT_KEEPALIVE_MS
    this.keepaliveTimer = setInterval(() => {
      this.sendRaw("ping")
    }, interval)
  }

  private async ensureSocket(): Promise<void> {
    if (this.stopped) return
    if (this.isUsable() || this.isConnecting()) return
    this.connecting = true
    try {
      await this.openSocket()
    } catch {
      // openSocket schedules a reconnect on failure.
    } finally {
      this.connecting = false
    }
  }

  private async openSocket(): Promise<void> {
    await ensureFreshAccessToken()
    if (this.stopped) return

    let ws: WebSocket
    try {
      ws = new WebSocket(this.opts.buildUrl())
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = ws

    this.connectTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close()
        } catch {
          // ignore
        }
      }
    }, CONNECT_TIMEOUT_MS)

    ws.onopen = () => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer)
        this.connectTimer = null
      }
      this.retryCount = 0
      this.lastPongAt = Date.now()
      this.startKeepalive()
      this.opts.onOpenChange?.(true)
    }

    ws.onmessage = (m) => {
      const raw = m.data
      if (typeof raw === "string" && raw === "pong") {
        this.lastPongAt = Date.now()
        return
      }
      try {
        const msg = JSON.parse(raw as string) as {
          type?: string
          event?: string
          task_id?: string
          data?: Record<string, string | undefined>
        }
        // Future-proof: honour a JSON server_ping if the backend ever sends one.
        if (msg.type === "server_ping") {
          this.sendRaw("pong")
          return
        }
        if (msg.type === "pong") {
          this.lastPongAt = Date.now()
          return
        }
        this.opts.onEvent(msg)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onerror = () => {
      this.opts.onOpenChange?.(false)
    }

    ws.onclose = () => {
      if (this.connectTimer) {
        clearTimeout(this.connectTimer)
        this.connectTimer = null
      }
      if (this.keepaliveTimer) {
        clearInterval(this.keepaliveTimer)
        this.keepaliveTimer = null
      }
      const wasUs = this.socket === ws
      if (wasUs) this.socket = null
      this.opts.onOpenChange?.(false)
      if (wasUs) this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.retryTimer) return
    const delay =
      RECONNECT_DELAYS[Math.min(this.retryCount, RECONNECT_DELAYS.length - 1)]
    this.retryCount += 1
    const epoch = this.epoch
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (epoch !== this.epoch) return
      void this.ensureSocket()
    }, delay)
  }

  private forceReconnect(): void {
    if (this.stopped) return
    this.epoch += 1
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.retryCount = 0
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // ignore
      }
      this.socket = null
    }
    this.connecting = false
    void this.ensureSocket()
  }

  /** iOS PWA recovery: don't trust onclose — probe when the tab comes back. */
  private probeOrReconnect(): void {
    if (this.stopped) return
    if (this.isConnecting()) return
    if (!this.isUsable()) {
      this.forceReconnect()
      return
    }
    const before = this.lastPongAt
    this.sendRaw("ping")
    if (this.probeTimer) clearTimeout(this.probeTimer)
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null
      if (this.stopped) return
      if (this.lastPongAt === before) this.forceReconnect()
    }, PROBE_TIMEOUT_MS)
  }

  private handleVisibility = () => {
    if (typeof document === "undefined") return
    if (document.visibilityState !== "visible") return
    this.probeOrReconnect()
  }
  private handlePageShow = (e: PageTransitionEvent) => {
    if (e.persisted) this.forceReconnect()
  }
  private handleFocus = () => this.probeOrReconnect()
  private handleOnline = () => this.probeOrReconnect()

  private attachDomListeners(): void {
    if (this.domAttached) return
    if (typeof document === "undefined" || typeof window === "undefined") return
    document.addEventListener("visibilitychange", this.handleVisibility)
    window.addEventListener("pageshow", this.handlePageShow)
    window.addEventListener("focus", this.handleFocus)
    window.addEventListener("online", this.handleOnline)
    this.domAttached = true
  }

  private detachDomListeners(): void {
    if (!this.domAttached) return
    if (typeof document === "undefined" || typeof window === "undefined") return
    document.removeEventListener("visibilitychange", this.handleVisibility)
    window.removeEventListener("pageshow", this.handlePageShow)
    window.removeEventListener("focus", this.handleFocus)
    window.removeEventListener("online", this.handleOnline)
    this.domAttached = false
  }
}

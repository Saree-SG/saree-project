import { useEffect, useMemo, useRef, useState } from "react"

import { type ChatWsEvent, connectChatWs } from "@/modules/chat/chatWs"

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]
const PING_INTERVAL_MS = 25_000

export function useChatSocket(roomId: string | null) {
  const [status, setStatus] = useState<
    "idle" | "connecting" | "open" | "closed" | "error"
  >("idle")
  const [events, setEvents] = useState<ChatWsEvent[]>([])
  const connRef = useRef<ReturnType<typeof connectChatWs> | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const roomIdRef = useRef(roomId)

  useEffect(() => {
    roomIdRef.current = roomId
  }, [roomId])

  useEffect(() => {
    if (!roomId) {
      connRef.current?.close()
      connRef.current = null
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      retryCountRef.current = 0
      setStatus("idle")
      setEvents([])
      return
    }

    connRef.current?.close()
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    if (pingTimerRef.current) clearInterval(pingTimerRef.current)
    retryCountRef.current = 0
    setEvents([])

    function startPing() {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      pingTimerRef.current = setInterval(() => {
        const conn = connRef.current
        if (conn && conn.ws.readyState === WebSocket.OPEN) {
          conn.ping()
        }
      }, PING_INTERVAL_MS)
    }

    function connect() {
      const currentRoomId = roomIdRef.current
      if (!currentRoomId) return

      const conn = connectChatWs({
        roomId: currentRoomId,
        onEvent: (evt) => {
          // Ignore pong events — they're only keepalive responses
          if (evt.type === "pong") return
          setEvents((prev) => [...prev, evt])
        },
        onStatus: (s) => {
          if (s === "connecting") {
            setStatus("connecting")
          } else if (s === "open") {
            retryCountRef.current = 0
            setStatus("open")
            startPing()
          } else if (s === "closed" || s === "error") {
            if (pingTimerRef.current) clearInterval(pingTimerRef.current)
            setStatus(s)
            // Auto-reconnect with backoff
            const delay = RECONNECT_DELAYS[Math.min(retryCountRef.current, RECONNECT_DELAYS.length - 1)]
            retryCountRef.current += 1
            retryTimerRef.current = setTimeout(() => {
              if (roomIdRef.current) connect()
            }, delay)
          }
        },
      })
      connRef.current = conn
    }

    connect()

    // Reconnect when tab becomes visible again (mobile background → foreground)
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && connRef.current) {
        const ws = connRef.current.ws
        if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
          retryCountRef.current = 0
          connect()
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      connRef.current?.close()
      connRef.current = null
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [roomId])

  return useMemo(() => ({
    status,
    events,
    sendMessage: (content: string) => connRef.current?.sendMessage(content),
    clearEvents: () => setEvents([]),
  }), [events, status])
}

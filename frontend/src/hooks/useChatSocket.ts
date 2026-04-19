import { useEffect, useMemo, useRef, useState } from "react"

import { type ChatWsEvent, connectChatWs } from "@/modules/chat/chatWs"

export function useChatSocket(roomId: string | null) {
  const [status, setStatus] = useState<
    "idle" | "connecting" | "open" | "closed" | "error"
  >("idle")
  const [events, setEvents] = useState<ChatWsEvent[]>([])
  const connRef = useRef<ReturnType<typeof connectChatWs> | null>(null)

  const api = useMemo(() => {
    return {
      status,
      events,
      sendMessage: (content: string) => {
        connRef.current?.sendMessage(content)
      },
      clearEvents: () => setEvents([]),
    }
  }, [events, status])

  useEffect(() => {
    if (!roomId) {
      connRef.current?.close()
      connRef.current = null
      setStatus("idle")
      setEvents([])
      return
    }

    connRef.current?.close()
    setEvents([])

    const conn = connectChatWs({
      roomId,
      onEvent: (evt) => setEvents((prev) => [...prev, evt]),
      onStatus: (s) => {
        if (s === "connecting") setStatus("connecting")
        else if (s === "open") setStatus("open")
        else if (s === "closed") setStatus("closed")
        else setStatus("error")
      },
    })
    connRef.current = conn

    return () => {
      conn.close()
      connRef.current = null
    }
  }, [roomId])

  return api
}

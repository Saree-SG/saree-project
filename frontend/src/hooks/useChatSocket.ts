import { useEffect, useMemo, useRef, useState } from "react"

import {
  type ChatWsEvent,
  type ChatWsStatus,
  getStatus,
  onStatusChange,
  sendChatMessage,
  subscribeRoom,
} from "@/modules/chat/chatWs"

type HookStatus = "idle" | "connecting" | "open" | "closed" | "error"

export function useChatSocket(
  roomId: string | null,
  onReconnected?: () => void,
) {
  const [status, setStatus] = useState<HookStatus>(() =>
    roomId ? mapStatus(getStatus()) : "idle",
  )
  const [events, setEvents] = useState<ChatWsEvent[]>([])
  const onReconnectedRef = useRef(onReconnected)
  const wasDownRef = useRef(false)

  useEffect(() => {
    onReconnectedRef.current = onReconnected
  }, [onReconnected])

  useEffect(() => {
    if (!roomId) {
      setStatus("idle")
      setEvents([])
      wasDownRef.current = false
      return
    }

    setEvents([])
    wasDownRef.current = false

    const unsubscribeRoom = subscribeRoom(roomId, (evt) => {
      // Filter out heartbeat traffic from the visible event log.
      if (evt.type === "pong" || evt.type === "server_ping") return
      if (evt.type === "subscribed" || evt.type === "unsubscribed") return
      // Only surface message-bearing events for the active room.
      const eventRoom =
        evt.type === "message.new"
          ? evt.message.room_id
          : "room_id" in evt
            ? evt.room_id
            : null
      if (eventRoom && eventRoom !== roomId) return
      setEvents((prev) => [...prev, evt])
    })

    const unsubscribeStatus = onStatusChange((s) => {
      const next = mapStatus(s)
      setStatus(next)
      if (next === "closed" || next === "error" || next === "connecting") {
        if (next !== "connecting") wasDownRef.current = true
      } else if (next === "open") {
        if (wasDownRef.current) {
          wasDownRef.current = false
          onReconnectedRef.current?.()
        }
      }
    })

    setStatus(mapStatus(getStatus()))

    return () => {
      unsubscribeRoom()
      unsubscribeStatus()
    }
  }, [roomId])

  return useMemo(
    () => ({
      status,
      events,
      sendMessage: (content: string) =>
        roomId ? sendChatMessage(roomId, content) : false,
      clearEvents: () => setEvents([]),
    }),
    [events, status, roomId],
  )
}

function mapStatus(s: ChatWsStatus): HookStatus {
  return s
}

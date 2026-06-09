import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Bell, BellOff, Smartphone } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  type Notification,
  type NotificationCategory,
} from "@/modules/notifications/notificationApi"
import { usePushNotifications } from "@/hooks/usePushNotifications"

function notifLink(notif: Notification): string {
  if (notif.entity_type === "task") return `/tasks/${notif.entity_id}`
  if (notif.entity_type === "project") return `/projects/${notif.entity_id}`
  if (notif.entity_type === "quotation") return `/quotations/${notif.entity_id}`
  // Chat is handled in handleClick: the route is `/chat` and the room is a
  // `room` search param, not a path segment (`/chat/{id}` would 404).
  return "/"
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {count > 0 && (
        <span className="flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "vừa xong"
  if (diffMins < 60) return `${diffMins} phút trước`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours} giờ trước`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} ngày trước`
}

export function NotificationBell() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [tab, setTab] = useState<NotificationCategory>("other")

  const { data: otherCountData } = useQuery({
    queryKey: ["notifications-unread-count", "other"],
    queryFn: () => getUnreadCount("other"),
    refetchInterval: 30_000,
  })

  const { data: chatCountData } = useQuery({
    queryKey: ["notifications-unread-count", "chat"],
    queryFn: () => getUnreadCount("chat"),
    refetchInterval: 30_000,
  })

  const { data: otherNotifications } = useQuery({
    queryKey: ["notifications-list", "other"],
    queryFn: () => listNotifications({ limit: 20, category: "other" }),
    refetchInterval: 60_000,
  })

  const { data: chatNotifications } = useQuery({
    queryKey: ["notifications-list", "chat"],
    queryFn: () => listNotifications({ limit: 20, category: "chat" }),
    refetchInterval: 60_000,
  })

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
    void queryClient.invalidateQueries({ queryKey: ["notifications-list"] })
  }

  const markReadMutation = useMutation({
    mutationFn: markRead,
    onSuccess: invalidateAll,
  })

  const markAllMutation = useMutation({
    mutationFn: (category: NotificationCategory) => markAllRead(category),
    onSuccess: invalidateAll,
  })

  const push = usePushNotifications()
  const otherUnread = otherCountData?.count ?? 0
  const chatUnread = chatCountData?.count ?? 0
  const totalUnread = otherUnread + chatUnread
  const items = (tab === "chat" ? chatNotifications : otherNotifications) ?? []
  const tabUnread = tab === "chat" ? chatUnread : otherUnread

  function handleClick(notif: Notification) {
    if (!notif.is_read) {
      markReadMutation.mutate(notif.id)
    }
    if (notif.entity_type === "chat") {
      void navigate({ to: "/chat", search: { room: notif.entity_id } })
      return
    }
    void navigate({ to: notifLink(notif) })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
          <Bell className="size-5" />
          {totalUnread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        {/* Two zones so chat messages never crowd out other notifications */}
        <div className="flex items-center gap-1 px-2 pt-2">
          <TabButton
            active={tab === "other"}
            label="Thông báo"
            count={otherUnread}
            onClick={() => setTab("other")}
          />
          <TabButton
            active={tab === "chat"}
            label="Tin nhắn"
            count={chatUnread}
            onClick={() => setTab("chat")}
          />
        </div>
        <div className="flex items-center justify-end px-3 py-1.5">
          {tabUnread > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllMutation.mutate(tab)}
              disabled={markAllMutation.isPending}
            >
              Đánh dấu đã đọc tất cả
            </button>
          )}
        </div>
        <>
          <DropdownMenuSeparator />
          <div className="px-3 py-2">
            {!push.isSupported ? (
              <p className="text-xs text-muted-foreground">
                {"Trình duyệt chưa hỗ trợ thông báo"}
                {typeof window !== "undefined" && !("serviceWorker" in navigator) && " (thiếu SW)"}
                {typeof window !== "undefined" && !("PushManager" in window) && " (thiếu Push)"}
                {typeof window !== "undefined" && !("Notification" in window) && " (thiếu Notif API)"}
              </p>
            ) : push.isSubscribed ? (
              <button
                className="flex w-full items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void push.unsubscribe()}
              >
                <BellOff className="size-3.5" />
                Tắt thông báo thiết bị này
              </button>
            ) : (
              <button
                className="flex w-full items-center gap-2 text-xs text-primary hover:text-primary/80 font-medium"
                onClick={() => void push.subscribe()}
              >
                <Smartphone className="size-3.5" />
                Bật thông báo thiết bị này
              </button>
            )}
          </div>
        </>

        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {tab === "chat" ? "Không có tin nhắn nào" : "Không có thông báo nào"}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                className="flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2.5"
                onClick={() => handleClick(notif)}
              >
                <div className="flex w-full items-start gap-2">
                  {!notif.is_read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <div className={`flex-1 ${notif.is_read ? "pl-4" : ""}`}>
                    <p className="text-sm font-medium leading-snug">{notif.title}</p>
                    {notif.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {notif.body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatTime(notif.created_at)}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

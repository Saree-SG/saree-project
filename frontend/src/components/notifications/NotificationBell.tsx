import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Bell, BellOff, Smartphone } from "lucide-react"

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
} from "@/modules/notifications/notificationApi"
import { usePushNotifications } from "@/hooks/usePushNotifications"

function notifLink(notif: Notification): string {
  if (notif.entity_type === "task") return `/tasks/${notif.entity_id}`
  if (notif.entity_type === "project") return `/projects/${notif.entity_id}`
  if (notif.entity_type === "quotation") return `/quotations/${notif.entity_id}`
  return "/"
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

  const { data: countData } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
  })

  const { data: notifications } = useQuery({
    queryKey: ["notifications-list"],
    queryFn: () => listNotifications({ limit: 20 }),
    refetchInterval: 60_000,
  })

  const markReadMutation = useMutation({
    mutationFn: markRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
      void queryClient.invalidateQueries({ queryKey: ["notifications-list"] })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
      void queryClient.invalidateQueries({ queryKey: ["notifications-list"] })
    },
  })

  const push = usePushNotifications()
  const unreadCount = countData?.count ?? 0
  const items = notifications ?? []

  function handleClick(notif: Notification) {
    if (!notif.is_read) {
      markReadMutation.mutate(notif.id)
    }
    void navigate({ to: notifLink(notif) })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Thông báo">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Thông báo</span>
          {unreadCount > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllMutation.mutate()}
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
            Không có thông báo nào
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

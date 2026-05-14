import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { listMyChatRooms } from "@/modules/chat/chatApi"
import { subscribeRoom } from "@/modules/chat/chatWs"

import { Footer } from "@/components/Common/Footer"
import { MobileAppHeader } from "@/components/Layout/MobileAppHeader"
import { MobileBottomNav } from "@/components/Layout/MobileBottomNav"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { getAccessToken } from "@/modules/auth/tokenStore"
import { buildTaskGlobalWsUrl } from "@/modules/tasks/taskWs"
import useRefreshState from "@/hooks/useRefreshState"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
})

function Layout() {
  const isRefreshing = useRefreshState()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isChatRoute = pathname.startsWith("/chat")
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const showSuccessToastRef = useRef(showSuccessToast)
  const showErrorToastRef = useRef(showErrorToast)
  const pathnameRef = useRef(pathname)

  useEffect(() => {
    showSuccessToastRef.current = showSuccessToast
    showErrorToastRef.current = showErrorToast
  }, [showSuccessToast, showErrorToast])

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      return
    }
    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(buildTaskGlobalWsUrl())
    } catch {
      return
    }
    ws.onmessage = (eventValue) => {
      try {
        const msg = JSON.parse(eventValue.data as string) as {
          event?: string
          task_id?: string
          data?: Record<string, string | undefined>
        }
        const data = msg.data ?? {}
        const actorId = data.actor_id
        const isOwnEvent = Boolean(actorId && actorId === currentUser?.id)
        const taskLabel = data.task_name ?? msg.task_id ?? "task"

        // If the user is already viewing this specific task's detail page,
        // the task-scoped WS (tasks.$taskId.tsx) will handle toasts —
        // skip them here to prevent duplicates.
        const isOnThisTaskPage =
          msg.task_id !== undefined &&
          pathnameRef.current === `/tasks/${msg.task_id}`

        if (
          msg.event === "task.status_changed" ||
          msg.event === "task.updated" ||
          msg.event === "task.assigned" ||
          msg.event === "project.assigned" ||
          msg.event === "task.progress_reported" ||
          msg.event === "task.discussion_added" ||
          msg.event === "task.delay_requested" ||
          msg.event === "task.delay_approved" ||
          msg.event === "task.delay_rejected" ||
          msg.event === "task.proof_uploaded" ||
          msg.event === "task.proof_approved" ||
          msg.event === "task.proof_rejected"
        ) {
          void queryClient.invalidateQueries({ queryKey: ["my-tasks-dashboard"] })
          void queryClient.invalidateQueries({ queryKey: ["project-dashboard"] })
          // Refresh notification bell immediately on any relevant event
          if (!isOwnEvent) {
            void queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] })
            void queryClient.invalidateQueries({ queryKey: ["notifications-list"] })
          }
        }

        if (!isOwnEvent && !isOnThisTaskPage) {
          if (msg.event === "task.status_changed") {
            showSuccessToastRef.current(
              `Task "${taskLabel}" chuyển trạng thái sang ${data.new_status ?? ""}`,
            )
          } else if (msg.event === "task.assigned") {
            showSuccessToastRef.current(
              data.message ??
                `${data.actor_name ?? "Quản lý"} đã giao công việc "${taskLabel}" cho bạn.`,
            )
          } else if (msg.event === "project.assigned") {
            showSuccessToastRef.current(
              data.message ?? `Bạn vừa được thêm vào dự án "${data.project_name ?? taskLabel}".`,
            )
          } else if (msg.event === "task.updated") {
            showSuccessToastRef.current(
              data.message ??
                `${data.actor_name ?? "Nhân viên"} đã cập nhật thông tin công việc "${taskLabel}".`,
            )
          } else if (msg.event === "task.progress_reported") {
            showSuccessToastRef.current(
              data.message ??
                `${data.actor_name ?? "Nhân viên"} đã cập nhật báo cáo tiến độ cho "${taskLabel}".`,
            )
          } else if (msg.event === "task.discussion_added") {
            showSuccessToastRef.current(
              data.message ??
                `${data.actor_name ?? "Nhân viên"} đã cập nhật thảo luận cho "${taskLabel}".`,
            )
          } else if (msg.event === "task.delay_requested") {
            showSuccessToastRef.current(
              `${data.author_name ?? "Nhân viên"} vừa gửi yêu cầu gia hạn cho "${taskLabel}".`,
            )
          } else if (msg.event === "task.delay_approved") {
            showSuccessToastRef.current(
              `Yêu cầu gia hạn của "${taskLabel}" đã được duyệt.`,
            )
          } else if (msg.event === "task.delay_rejected") {
            showErrorToastRef.current(
              `Yêu cầu gia hạn của "${taskLabel}" đã bị từ chối.`,
            )
          } else if (msg.event === "task.proof_uploaded") {
            showSuccessToastRef.current(
              `${data.uploader_name ?? "Nhân viên"} vừa nộp bằng chứng cho "${taskLabel}".`,
            )
          } else if (msg.event === "task.proof_approved") {
            showSuccessToastRef.current(
              `Bằng chứng của "${taskLabel}" đã được duyệt.`,
            )
          } else if (msg.event === "task.proof_rejected") {
            showErrorToastRef.current(
              `Bằng chứng của "${taskLabel}" đã bị từ chối.`,
            )
          }
        }
      } catch {
        return
      }
    }
    return () => {
      ws?.close()
    }
  }, [currentUser?.id, queryClient])

  useEffect(() => {
    if (!currentUser?.id) return
    let active = true
    const cleanups: Array<() => void> = []

    async function subscribeAllRooms() {
      try {
        const rooms = await listMyChatRooms()
        if (!active) return
        for (const room of rooms) {
          const unsub = subscribeRoom(room.id, (evt) => {
            if (evt.type !== "message.new") return
            const msg = evt.message
            // Skip own messages
            if (msg.sender_id === currentUser?.id) return
            // Skip when user is on the chat page (they see messages directly)
            if (window.location.pathname.startsWith("/chat")) return
            // Show toast: sender name + truncated content
            const senderName = msg.sender_name || "Chat"
            const content = msg.content
              ? msg.content.length > 60 ? msg.content.slice(0, 60) + "…" : msg.content
              : "📎 Tệp đính kèm"
            toast(senderName, {
              description: content,
              id: `chat-msg-${msg.room_id}`,
              duration: 4000,
            })
            void queryClient.invalidateQueries({ queryKey: ["chat", "unread-count"] })
          })
          cleanups.push(unsub)
        }
      } catch {
        // ignore
      }
    }

    void subscribeAllRooms()

    return () => {
      active = false
      for (const cleanup of cleanups) cleanup()
    }
  }, [currentUser?.id, queryClient])

  if (isChatRoute) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex h-dvh min-h-0 flex-col overflow-hidden">
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)] pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pt-0 md:pb-0">
            <Outlet />
          </main>
          <MobileBottomNav />
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex min-h-svh flex-col">
        <MobileAppHeader />
        <header className="supports-backdrop-filter:bg-background/80 sticky top-0 z-20 hidden h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:flex">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <div className="ml-auto flex items-center gap-2">
            {isRefreshing ? (
              <p className="text-xs text-muted-foreground">
                Re-authenticating session...
              </p>
            ) : null}
            <NotificationBell />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-0">
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:px-8 md:py-8 md:pb-8">
            <Outlet />
          </main>
          <Footer />
        </div>
        <MobileBottomNav />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Layout

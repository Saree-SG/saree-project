import type { QueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { getAccessToken } from "@/modules/auth/tokenStore"
import { ResilientWebSocket } from "@/modules/realtime/resilientWs"
import { buildTaskWsUrl } from "@/modules/tasks/taskWs"

interface UseTaskWebSocketOptions {
  queryClient: QueryClient
  currentUserId: string | undefined
  showSuccessToast: (msg: string) => void
  showErrorToast: (msg: string) => void
}

export function useTaskWebSocket(
  taskId: string,
  {
    queryClient,
    currentUserId,
    showSuccessToast,
    showErrorToast,
  }: UseTaskWebSocketOptions,
): boolean {
  const [wsConnected, setWsConnected] = useState(false)
  const showSuccessRef = useRef(showSuccessToast)
  const showErrorRef = useRef(showErrorToast)

  useEffect(() => {
    showSuccessRef.current = showSuccessToast
  }, [showSuccessToast])

  useEffect(() => {
    showErrorRef.current = showErrorToast
  }, [showErrorToast])

  useEffect(() => {
    const token = getAccessToken()
    if (!token || !taskId) return

    const handleEvent = (msg: {
      event?: string
      data?: Record<string, string | undefined>
    }) => {
      const d = msg.data ?? {}
      const isOwnEvent = Boolean(d.actor_id && d.actor_id === currentUserId)

      const invalidate = (...keys: string[]) => {
        for (const key of keys) {
          void queryClient.invalidateQueries({
            queryKey: ["task-detail", key, taskId],
          })
        }
      }

      switch (msg.event) {
        case "task.delay_requested":
          invalidate("comments")
          if (!isOwnEvent)
            showSuccessRef.current(
              `${d.author_name ?? "Người thực hiện"} vừa xin gia hạn deadline`,
            )
          break
        case "task.delay_approved":
          invalidate("task", "audit", "comments")
          if (!isOwnEvent)
            showSuccessRef.current(
              `Deadline đã được duyệt → ${d.new_end_time ?? ""}`,
            )
          break
        case "task.delay_rejected":
          invalidate("comments", "audit")
          if (!isOwnEvent) showErrorRef.current("Yêu cầu gia hạn bị từ chối")
          break
        case "task.proof_uploaded":
          invalidate("proofs", "audit")
          if (!isOwnEvent)
            showSuccessRef.current(
              `${d.uploader_name ?? "Người thực hiện"} vừa nộp bằng chứng`,
            )
          break
        case "task.proof_approved":
          invalidate("proofs", "audit")
          if (!isOwnEvent) showSuccessRef.current("Bằng chứng đã được duyệt")
          break
        case "task.proof_rejected":
          invalidate("proofs", "audit")
          if (!isOwnEvent)
            showErrorRef.current(`Bằng chứng bị từ chối: ${d.note ?? ""}`)
          break
        case "task.status_changed":
          invalidate("task", "audit")
          if (!isOwnEvent)
            showSuccessRef.current(`Trạng thái → ${d.new_status ?? ""}`)
          break
        case "task.updated":
          invalidate("task", "audit")
          void queryClient.invalidateQueries({
            queryKey: ["task-detail", "project-tasks"],
          })
          if (!isOwnEvent)
            showSuccessRef.current(
              d.message ??
                `${d.actor_name ?? "Nhân viên"} đã cập nhật thông tin công việc "${d.task_name ?? ""}".`,
            )
          break
        case "task.progress_reported":
          invalidate("progress-reports", "task", "audit")
          if (!isOwnEvent)
            showSuccessRef.current(
              d.message ??
                `${d.actor_name ?? "Nhân viên"} đã cập nhật "báo cáo tiến độ" cho công việc "${d.task_name ?? ""}".`,
            )
          break
        case "task.progress_approved":
          invalidate("progress-reports", "task", "audit")
          if (!isOwnEvent)
            showSuccessRef.current("Báo cáo tiến độ đã được duyệt")
          break
        case "task.progress_rejected":
          invalidate("progress-reports", "task", "audit")
          if (!isOwnEvent)
            showErrorRef.current(
              `Báo cáo tiến độ bị từ chối${d.note ? `: ${d.note}` : ""}`,
            )
          break
        case "task.ready_for_review":
          invalidate("task", "audit")
          if (!isOwnEvent)
            showSuccessRef.current(
              `"${d.task_name ?? "Công việc"}" đã đạt 100% — cần vào kiểm tra (review)`,
            )
          break
        case "task.reassigned_away":
          invalidate("task", "audit")
          if (!isOwnEvent)
            showErrorRef.current(
              d.message ??
                `Công việc "${d.task_name ?? ""}" đã được chuyển giao cho người khác.`,
            )
          break
        case "task.discussion_added":
          invalidate("comments", "audit")
          if (!isOwnEvent)
            showSuccessRef.current(
              d.message ??
                `${d.actor_name ?? "Nhân viên"} đã cập nhật "thảo luận" cho công việc "${d.task_name ?? ""}".`,
            )
          break
        default:
          break
      }
    }

    const rws = new ResilientWebSocket({
      buildUrl: () => buildTaskWsUrl(taskId),
      onEvent: handleEvent,
      onOpenChange: setWsConnected,
    })
    rws.start()

    return () => {
      setWsConnected(false)
      rws.stop()
    }
  }, [taskId, queryClient, currentUserId])

  return wsConnected
}

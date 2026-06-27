import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ExternalLink, User } from "lucide-react"
import { useEffect, useState } from "react"

import { TasksService } from "@/client"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

import type { GanttRow } from "./types"

function initials(name?: string | null): string {
  if (!name) return "?"
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  )
}

function toDateInput(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, "0")
  const day = String(dt.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Only the real backend workflow statuses. "blocked"/"cancelled" were never
// valid (the server stores todo|in_progress|review|done) and "review" is set by
// the system at 100% — kept here only so a task already in review displays it.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "todo", label: "Chưa làm" },
  { value: "in_progress", label: "Đang làm" },
  { value: "review", label: "Review" },
  { value: "done", label: "Hoàn thành" },
]

type Props = {
  open: boolean
  onClose: () => void
  row: GanttRow | null
  /** Query keys to invalidate after save */
  invalidateKeys?: unknown[][]
}

export default function TaskQuickEdit({
  open,
  onClose,
  row,
  invalidateKeys = [],
}: Props) {
  const qc = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const [name, setName] = useState("")
  const [status, setStatus] = useState("todo")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!row) return
    setName(row.name)
    setStatus(row.status)
    setStart(toDateInput(row.start))
    setEnd(toDateInput(row.end))
    setProgress(row.progress)
  }, [row])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("No task")
      const startMs = new Date(`${start}T00:00:00`).getTime()
      const endMs = new Date(`${end}T23:59:59`).getTime()
      if (endMs <= startMs) {
        throw new Error("Ngày kết thúc phải sau ngày bắt đầu")
      }
      // Field update — name + timeline only. progress (reported_progress_total)
      // is a server-side rollup of approved reports; writing it here did nothing
      // useful and risked desync, so it's no longer sent (P3-9).
      await TasksService.updateTask({
        taskId: row.id,
        requestBody: {
          name,
          start_time: new Date(`${start}T00:00:00`).toISOString(),
          end_time: new Date(`${end}T23:59:59`).toISOString(),
        } as never,
      })
      // Status changes go through the dedicated, guarded endpoint instead of a
      // raw field PATCH (enforces assignee/review/100%-done rules) (P3-9).
      if (status !== row.status) {
        await TasksService.updateTaskStatus({
          taskId: row.id,
          requestBody: { status } as never,
        })
      }
    },
    onSuccess: async () => {
      showSuccessToast("Đã lưu task")
      for (const key of invalidateKeys) {
        await qc.invalidateQueries({ queryKey: key })
      }
      onClose()
    },
    onError: handleError.bind(showErrorToast),
  })

  return (
    <Sheet open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Chỉnh sửa nhanh</SheetTitle>
        </SheetHeader>

        {!row ? (
          <p className="px-4 text-sm text-muted-foreground">Chưa chọn task.</p>
        ) : (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {initials(row.assignee_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  {row.assignee_name || "Chưa gán"}
                </div>
                {row.is_on_critical_path ? (
                  <Badge className="mt-1 bg-rose-100 text-rose-700 hover:bg-rose-100">
                    Critical path
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Tên công việc</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Trạng thái</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Bắt đầu</Label>
                <Input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Kết thúc</Label>
                <Input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Tiến độ: {progress}%</Label>
              {/* Read-only — progress is computed from approved progress reports,
                  not editable here. Submit/approve reports on the task detail. */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tiến độ tính từ báo cáo đã duyệt — cập nhật ở trang chi tiết.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Link
                to="/tasks/$taskId"
                params={{ taskId: row.id }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Mở trang đầy đủ
              </Link>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Huỷ
                </Button>
                <LoadingButton
                  size="sm"
                  loading={mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  Lưu
                </LoadingButton>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

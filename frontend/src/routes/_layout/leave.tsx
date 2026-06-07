import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  CalendarOff,
  CheckCircle2,
  Clock,
  Inbox,
  Plus,
  XCircle,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import type { LeaveRequestPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useCan } from "@/hooks/useMyPermissions"
import {
  approveLeaveRequest,
  cancelLeaveRequest,
  createLeaveRequest,
  LEAVE_STATUS_BADGE,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  type LeaveStatus,
  type LeaveType,
  listMyLeaveRequests,
  listPendingLeaveRequests,
  rejectLeaveRequest,
} from "@/modules/leave/leaveApi"

export const Route = createFileRoute("/_layout/leave")({
  component: LeavePage,
  head: () => ({
    meta: [{ title: "Nghỉ phép - Saree" }],
  }),
})

function errMsg(e: any, fallback: string): string {
  return e?.body?.detail ?? e?.response?.data?.detail ?? e?.message ?? fallback
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString("vi-VN")
  } catch {
    return d
  }
}

function StatusBadge({ status }: { status: string }) {
  const s = status as LeaveStatus
  return (
    <Badge className={LEAVE_STATUS_BADGE[s] ?? ""} variant="secondary">
      {LEAVE_STATUS_LABELS[s] ?? status}
    </Badge>
  )
}

function LeaveRequestRow({
  item,
  onCancel,
  cancelling,
}: {
  item: LeaveRequestPublic
  onCancel?: (id: string) => void
  cancelling?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {LEAVE_TYPE_LABELS[item.leave_type as LeaveType] ?? item.leave_type}
          </span>
          <StatusBadge status={item.status} />
          <span className="text-sm text-muted-foreground">
            {item.num_days} ngày
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmtDate(item.start_date)} → {fmtDate(item.end_date)}
          {item.half_day ? " (nửa ngày)" : ""}
        </p>
        {item.reason ? (
          <p className="mt-1 line-clamp-2 text-sm">{item.reason}</p>
        ) : null}
        {item.status === "rejected" && item.decision_note ? (
          <p className="mt-1 text-sm text-red-600">
            Lý do từ chối: {item.decision_note}
          </p>
        ) : null}
      </div>
      {onCancel && item.status === "pending" ? (
        <Button
          variant="outline"
          size="sm"
          disabled={cancelling}
          onClick={() => onCancel(item.id)}
        >
          Hủy đơn
        </Button>
      ) : null}
    </div>
  )
}

function LeavePage() {
  const qc = useQueryClient()
  const canApprove = useCan("LEAVE_APPROVE")

  const today = new Date().toISOString().slice(0, 10)
  const [leaveType, setLeaveType] = useState<LeaveType>("annual")
  const [startDate, setStartDate] = useState<string>(today)
  const [endDate, setEndDate] = useState<string>(today)
  const [halfDay, setHalfDay] = useState<string>("none")
  const [reason, setReason] = useState<string>("")

  const isSingleDay = startDate !== "" && startDate === endDate

  const myQuery = useQuery({
    queryKey: ["leave-me"],
    queryFn: () => listMyLeaveRequests(),
  })

  const pendingQuery = useQuery({
    queryKey: ["leave-pending"],
    queryFn: () => listPendingLeaveRequests(),
    enabled: canApprove,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createLeaveRequest({
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        half_day: isSingleDay && halfDay !== "none" ? halfDay : null,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Đã gửi đơn xin nghỉ")
      setReason("")
      setHalfDay("none")
      qc.invalidateQueries({ queryKey: ["leave-me"] })
      qc.invalidateQueries({ queryKey: ["leave-pending"] })
    },
    onError: (e: any) => toast.error(errMsg(e, "Gửi đơn thất bại")),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelLeaveRequest(id),
    onSuccess: () => {
      toast.success("Đã hủy đơn")
      qc.invalidateQueries({ queryKey: ["leave-me"] })
      qc.invalidateQueries({ queryKey: ["leave-pending"] })
    },
    onError: (e: any) => toast.error(errMsg(e, "Hủy đơn thất bại")),
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveLeaveRequest(id),
    onSuccess: () => {
      toast.success("Đã duyệt đơn")
      qc.invalidateQueries({ queryKey: ["leave-pending"] })
      qc.invalidateQueries({ queryKey: ["leave-me"] })
    },
    onError: (e: any) => toast.error(errMsg(e, "Duyệt đơn thất bại")),
  })

  const [rejectTarget, setRejectTarget] = useState<LeaveRequestPublic | null>(
    null,
  )
  const [rejectNote, setRejectNote] = useState("")
  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      rejectLeaveRequest(id, note),
    onSuccess: () => {
      toast.success("Đã từ chối đơn")
      setRejectTarget(null)
      setRejectNote("")
      qc.invalidateQueries({ queryKey: ["leave-pending"] })
      qc.invalidateQueries({ queryKey: ["leave-me"] })
    },
    onError: (e: any) => toast.error(errMsg(e, "Từ chối đơn thất bại")),
  })

  const myRequests = myQuery.data?.data ?? []
  const pendingRequests = pendingQuery.data?.data ?? []

  const canSubmit = useMemo(
    () => Boolean(startDate && endDate && endDate >= startDate),
    [startDate, endDate],
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-1 pb-10 sm:px-2">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarOff className="size-6 text-primary" /> Xin nghỉ phép
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gửi đơn xin nghỉ và theo dõi trạng thái duyệt.
        </p>
      </div>

      {/* New request form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="size-5" /> Tạo đơn mới
          </CardTitle>
          <CardDescription>
            Đơn sẽ được gửi tới người duyệt của công ty (mặc định: Giám đốc).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Loại nghỉ</Label>
              <Select
                value={leaveType}
                onValueChange={(v) => setLeaveType(v as LeaveType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nghỉ nửa ngày</Label>
              <Select
                value={isSingleDay ? halfDay : "none"}
                onValueChange={setHalfDay}
                disabled={!isSingleDay}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Cả ngày</SelectItem>
                  <SelectItem value="am">Buổi sáng</SelectItem>
                  <SelectItem value="pm">Buổi chiều</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Từ ngày</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (endDate < e.target.value) setEndDate(e.target.value)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Đến ngày</Label>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Lý do</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do xin nghỉ..."
              rows={3}
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
          >
            <Plus className="size-4" /> Gửi đơn
          </Button>
        </CardContent>
      </Card>

      {/* Approver queue */}
      {canApprove ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Inbox className="size-5" /> Cần tôi duyệt
              {pendingRequests.length > 0 ? (
                <Badge variant="secondary">{pendingRequests.length}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Không có đơn nào đang chờ duyệt.
              </p>
            ) : (
              pendingRequests.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {item.user_name ?? "Nhân viên"}
                      </span>
                      <Badge variant="outline">
                        {LEAVE_TYPE_LABELS[item.leave_type as LeaveType] ??
                          item.leave_type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {item.num_days} ngày
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {fmtDate(item.start_date)} → {fmtDate(item.end_date)}
                    </p>
                    {item.reason ? (
                      <p className="mt-1 text-sm">{item.reason}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(item.id)}
                    >
                      <CheckCircle2 className="size-4" /> Duyệt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejectTarget(item)
                        setRejectNote("")
                      }}
                    >
                      <XCircle className="size-4" /> Từ chối
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* My requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="size-5" /> Đơn của tôi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {myQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : myRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bạn chưa có đơn xin nghỉ nào.
            </p>
          ) : (
            myRequests.map((item) => (
              <LeaveRequestRow
                key={item.id}
                item={item}
                onCancel={(id) => cancelMutation.mutate(id)}
                cancelling={cancelMutation.isPending}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối đơn nghỉ</DialogTitle>
            <DialogDescription>
              Nhập lý do từ chối — nhân viên sẽ nhận được thông báo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Lý do từ chối..."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim() || rejectMutation.isPending}
              onClick={() => {
                if (rejectTarget)
                  rejectMutation.mutate({
                    id: rejectTarget.id,
                    note: rejectNote.trim(),
                  })
              }}
            >
              Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Building,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Image as ImageIcon,
  PencilLine,
  XCircle,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import {
  type AttendanceTeamRecord,
  adjustAttendanceHours,
  listCompanyAttendance,
} from "@/modules/attendance/attendanceApi"

// Maximum length of a single shift — keep in sync with backend MAX_SHIFT_HOURS.
const MAX_SHIFT_HOURS = 8

/** Local YYYY-MM-DD (so the date filter matches the user's calendar day). */
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  })
}

type Props = {
  companyId: string | null
}

export default function CompanyAttendancePanel({ companyId }: Props) {
  const qc = useQueryClient()
  const today = useMemo(() => isoDate(new Date()), [])
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [editing, setEditing] = useState<AttendanceTeamRecord | null>(null)

  const query = useQuery({
    queryKey: ["company-attendance", companyId, dateFrom, dateTo],
    queryFn: () =>
      listCompanyAttendance({
        companyId: companyId as string,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    enabled: Boolean(companyId),
  })

  const records = query.data?.data ?? []
  const totalHours = records.reduce((sum, r) => sum + (r.work_hours ?? 0), 0)
  // Pending review = forgotten check-out still awaiting a manager's hours, but
  // NOT the ones already recorded as absent (those need no review).
  const pendingReview = records.filter(
    (r) => r.is_auto_closed && !r.is_absent && r.work_hours == null,
  ).length
  const absentCount = records.filter((r) => r.is_absent).length

  if (!companyId) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          Hãy chọn một công ty để xem chấm công.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters + summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="text-primary size-4" /> Chấm công nhân
            viên
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Từ ngày</Label>
              <Input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Đến ngày</Label>
              <Input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>
              <span className="text-foreground font-semibold">
                {records.length}
              </span>{" "}
              lượt chấm công
            </span>
            <span>
              Tổng{" "}
              <span className="text-foreground font-semibold">
                {Math.round(totalHours * 100) / 100}
              </span>{" "}
              giờ công
            </span>
            {pendingReview > 0 ? (
              <span className="text-amber-600">
                {pendingReview} ca chờ xác nhận giờ
              </span>
            ) : null}
            {absentCount > 0 ? (
              <span className="text-destructive">{absentCount} ca vắng</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Records */}
      <Card>
        <CardContent className="space-y-2 pt-6">
          {query.isLoading ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Đang tải…
            </p>
          ) : records.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Không có lượt chấm công nào trong khoảng thời gian này.
            </p>
          ) : (
            records.map((r) => (
              <div
                key={r.id}
                className="hover:bg-muted/40 flex flex-col gap-2 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">
                      {r.user_name || r.user_email || "Nhân viên"}
                    </span>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    {r.mode === "company" ? (
                      <Building className="size-3.5 shrink-0" />
                    ) : (
                      <Building2 className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{r.location_label}</span>
                    {r.task_label ? (
                      <span className="truncate">· 🔧 {r.task_label}</span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {fmtTime(r.check_in_at)} → {fmtTime(r.check_out_at)}
                    </span>
                    <ValidityBadge
                      valid={r.check_in_valid}
                      distanceM={r.check_in_distance_m}
                      label="vào"
                    />
                    {r.check_out_at ? (
                      <ValidityBadge
                        valid={r.check_out_valid}
                        distanceM={r.check_out_distance_m}
                        label="ra"
                      />
                    ) : null}
                    {r.is_absent ? (
                      <span className="text-destructive">
                        · vắng (quên chấm công ra)
                      </span>
                    ) : r.is_auto_closed ? (
                      <span className="text-amber-600">
                        · tự đóng (quên check-out)
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 pt-0.5">
                    <PhotoLink url={r.check_in_photo_url} label="Ảnh vào" />
                    <PhotoLink url={r.check_out_photo_url} label="Ảnh ra" />
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <span
                    className={`text-sm font-semibold ${
                      r.work_hours == null
                        ? r.is_absent
                          ? "text-destructive"
                          : r.is_auto_closed
                            ? "text-amber-600"
                            : "text-emerald-600"
                        : ""
                    }`}
                  >
                    {r.work_hours != null
                      ? `${r.work_hours} giờ`
                      : r.is_absent
                        ? "vắng"
                        : r.is_auto_closed
                          ? "chờ xác nhận"
                          : "đang mở"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setEditing(r)}
                  >
                    <PencilLine className="size-3.5" /> Sửa giờ
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AdjustHoursDialog
        record={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          void qc.invalidateQueries({ queryKey: ["company-attendance"] })
        }}
      />
    </div>
  )
}

function ValidityBadge({
  valid,
  distanceM,
  label,
}: {
  valid: boolean | null
  distanceM: number | null
  label: string
}) {
  return (
    <Badge
      variant={valid ? "secondary" : "destructive"}
      className="h-5 gap-1 px-1.5 text-[10px]"
    >
      {valid ? (
        <CheckCircle2 className="size-3" />
      ) : (
        <XCircle className="size-3" />
      )}
      {label} · ~{Math.round(distanceM ?? 0)}m
    </Badge>
  )
}

function PhotoLink({ url, label }: { url: string | null; label: string }) {
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
    >
      <ImageIcon className="size-3.5" /> {label}
    </a>
  )
}

function AdjustHoursDialog({
  record,
  onClose,
  onSaved,
}: {
  record: AttendanceTeamRecord | null
  onClose: () => void
  onSaved: () => void
}) {
  const [hours, setHours] = useState("")
  const [note, setNote] = useState("")

  // Reset the form whenever a different record is opened.
  const recordId = record?.id ?? null
  const [lastId, setLastId] = useState<string | null>(null)
  if (recordId !== lastId) {
    setLastId(recordId)
    setHours(record?.work_hours != null ? String(record.work_hours) : "")
    setNote("")
  }

  const mutation = useMutation({
    mutationFn: () =>
      adjustAttendanceHours({
        recordId: record!.id,
        workHours: Number(hours),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Đã cập nhật giờ công")
      onSaved()
    },
    onError: () => {
      toast.error("Không thể cập nhật giờ công")
    },
  })

  const hoursNum = Number(hours)
  const invalid =
    hours === "" ||
    Number.isNaN(hoursNum) ||
    hoursNum < 0 ||
    hoursNum > MAX_SHIFT_HOURS

  return (
    <Dialog open={record != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa giờ công</DialogTitle>
          <DialogDescription>
            {record?.user_name || record?.user_email} · {record?.location_label}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Giờ công (0 – {MAX_SHIFT_HOURS})</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.25"
              min={0}
              max={MAX_SHIFT_HOURS}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú (tuỳ chọn)</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Lý do điều chỉnh…"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            type="button"
            disabled={invalid || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

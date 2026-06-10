import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Building,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  History,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  Settings,
  XCircle,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { CameraCapture } from "@/components/Common/CameraCapture"
import { CustomerCompanyFormDialog } from "@/components/Company/CustomerCompanyFormDialog"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useGeolocation } from "@/hooks/useGeolocation"
import { useCan } from "@/hooks/useMyPermissions"
import {
  type AttendanceMode,
  type AttendanceRecord,
  checkIn,
  checkOut,
  listCompaniesForAttendance,
  listMyAttendance,
  listMyCompaniesForAttendance,
  listProjectsForAttendance,
  listTaskSuggestions,
} from "@/modules/attendance/attendanceApi"
import { listCustomerCompanies } from "@/modules/company/customerCompanyApi"

export const Route = createFileRoute("/_layout/attendance")({
  component: AttendancePage,
})

function fmtTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  })
}

function AttendancePage() {
  const qc = useQueryClient()
  const geo = useGeolocation()
  const canConfig = useCan("ATTENDANCE_CONFIG_SITE")
  // Only managers (team viewers) may see GPS validity + distance; the person
  // checking in (người nộp) must not see whether they were "đúng/lệch vị trí".
  const canSeeValidity = useCan("ATTENDANCE_VIEW_TEAM")
  // Customer directory is manager-scoped (L1/L2). Plain workers only see their
  // own company in the by-company picker.
  const canViewCustomers = useCan("CUSTOMER_VIEW")
  const canCreateCustomer = useCan("CUSTOMER_CREATE")
  const [mode, setMode] = useState<AttendanceMode>("project")
  const [projectId, setProjectId] = useState<string>("")
  // Encoded company-mode target: "tenant:<id>" | "customer:<id>".
  const [companySel, setCompanySel] = useState<string>("")
  const [taskLabel, setTaskLabel] = useState<string>("")
  // Full create-customer-company dialog opened from the by-company picker.
  const [customerFormOpen, setCustomerFormOpen] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  // Bumped after a successful check-in/out to remount the camera (clear preview).
  const [cameraNonce, setCameraNonce] = useState(0)

  // Check-in/out flow dialog: pressing the action button opens the camera, then
  // a confirm popup (photo + time), then a result popup.
  const [flowOpen, setFlowOpen] = useState(false)
  // Captured at submit time so the dialog stays stable even after the open
  // record is refetched away on check-out.
  const [flowKind, setFlowKind] = useState<"in" | "out">("in")
  const [flowPhase, setFlowPhase] = useState<"camera" | "confirm" | "result">(
    "camera",
  )
  const [resultRecord, setResultRecord] = useState<AttendanceRecord | null>(
    null,
  )
  const [capturedAt, setCapturedAt] = useState<Date | null>(null)

  // Object URL for the captured photo, shown in the confirm/result popup.
  const photoUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  )
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  const projectsQuery = useQuery({
    queryKey: ["attendance-projects"],
    queryFn: listProjectsForAttendance,
  })

  const companiesQuery = useQuery({
    queryKey: ["attendance-companies"],
    queryFn: listCompaniesForAttendance,
  })

  // "Công ty của tôi" = tenant(s) the account belongs to.
  const myCompaniesQuery = useQuery({
    queryKey: ["attendance-my-companies"],
    queryFn: listMyCompaniesForAttendance,
  })

  // "Công ty khách hàng" = customer directory entries (used for on-site work).
  // Only loaded for users allowed to see the directory (managers / L1-L2).
  const customerCompaniesQuery = useQuery({
    queryKey: ["attendance-customer-companies"],
    queryFn: () => listCustomerCompanies({ type: "customer" }),
    enabled: canViewCustomers,
  })

  const taskSuggestionsQuery = useQuery({
    queryKey: ["attendance-task-suggestions"],
    queryFn: listTaskSuggestions,
  })

  const myQuery = useQuery({
    queryKey: ["attendance-me"],
    queryFn: () => listMyAttendance(),
  })

  const openRecord: AttendanceRecord | undefined = useMemo(
    () => myQuery.data?.data.find((r) => r.check_out_at === null),
    [myQuery.data],
  )

  const projectsById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projectsQuery.data ?? []) m.set(p.id, p.name)
    return m
  }, [projectsQuery.data])

  const companiesById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of companiesQuery.data ?? []) m.set(c.id, c.name)
    for (const c of myCompaniesQuery.data ?? []) m.set(c.id, c.name)
    return m
  }, [companiesQuery.data, myCompaniesQuery.data])

  const customerCompaniesById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of customerCompaniesQuery.data ?? []) m.set(c.id, c.name)
    return m
  }, [customerCompaniesQuery.data])

  function resetForm() {
    setPhoto(null)
    setCameraNonce((n) => n + 1)
  }

  // Decode the by-company picker selection into API params.
  function parseCompanySel(): {
    companyId?: string
    customerCompanyId?: string
  } {
    if (companySel.startsWith("tenant:"))
      return { companyId: companySel.slice("tenant:".length) }
    if (companySel.startsWith("customer:"))
      return { customerCompanyId: companySel.slice("customer:".length) }
    return {}
  }

  // Validate the location/task selection before opening the camera so the user
  // doesn't take a photo only to hit a validation error.
  function selectionError(): string | null {
    if (openRecord) return null // check-out keeps the open record's context
    if (mode === "project") {
      if (!projectId) return "Hãy chọn công trình"
    } else {
      if (!companySel) return "Hãy chọn công ty"
      if (!taskLabel.trim()) return "Hãy nhập công việc"
    }
    return null
  }

  function startFlow() {
    const err = selectionError()
    if (err) {
      toast.error(err)
      return
    }
    setFlowKind(openRecord ? "out" : "in")
    setPhoto(null)
    setResultRecord(null)
    setCapturedAt(null)
    setFlowPhase("camera")
    setCameraNonce((n) => n + 1)
    setFlowOpen(true)
  }

  function submitFlow() {
    if (flowKind === "out") checkOutMutation.mutate()
    else checkInMutation.mutate()
  }

  function closeFlow() {
    setFlowOpen(false)
    resetForm()
  }

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!photo) throw new Error("Hãy chụp ảnh tại nơi làm việc")
      if (mode === "project") {
        if (!projectId) throw new Error("Hãy chọn công trình")
      } else {
        if (!companySel) throw new Error("Hãy chọn công ty")
        if (!taskLabel.trim()) throw new Error("Hãy nhập công việc")
      }
      const target = parseCompanySel()
      const fix = await geo.locate()
      return checkIn({
        mode,
        projectId: mode === "project" ? projectId : undefined,
        companyId: mode === "company" ? target.companyId : undefined,
        customerCompanyId:
          mode === "company" ? target.customerCompanyId : undefined,
        taskLabel: mode === "company" ? taskLabel.trim() : undefined,
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracy,
        file: photo,
      })
    },
    onSuccess: (rec) => {
      toast.success("Đã chấm công vào")
      setResultRecord(rec)
      setFlowPhase("result")
      qc.invalidateQueries({ queryKey: ["attendance-me"] })
      qc.invalidateQueries({ queryKey: ["attendance-task-suggestions"] })
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.detail ?? e?.message ?? "Chấm công thất bại",
      ),
  })

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!openRecord) throw new Error("Không có ca đang mở")
      if (!photo) throw new Error("Hãy chụp ảnh khi ra về")
      const fix = await geo.locate()
      return checkOut({
        recordId: openRecord.id,
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracy,
        file: photo,
      })
    },
    onSuccess: (rec) => {
      toast.success(`Đã chấm công ra — ${rec.work_hours ?? 0} giờ công`)
      setResultRecord(rec)
      setFlowPhase("result")
      qc.invalidateQueries({ queryKey: ["attendance-me"] })
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.detail ?? e?.message ?? "Check-out thất bại",
      ),
  })

  const busy =
    checkInMutation.isPending || checkOutMutation.isPending || geo.loading

  function recordLocationName(rec: AttendanceRecord): string {
    if (rec.mode === "company") {
      if (rec.customer_company_id) {
        return (
          customerCompaniesById.get(rec.customer_company_id) ??
          "Công ty khách hàng"
        )
      }
      const c = rec.company_id ? companiesById.get(rec.company_id) : null
      return c ?? "Công ty"
    }
    const p = rec.project_id ? projectsById.get(rec.project_id) : null
    return p ?? "Công trình"
  }

  const openProjectName = openRecord ? recordLocationName(openRecord) : null

  // A shift open longer than the 8h cap means the worker likely forgot to
  // check out; warn them (the server will cap hours at 8h on check-out).
  const openHours = openRecord
    ? (Date.now() - new Date(openRecord.check_in_at).getTime()) / 3_600_000
    : 0
  const openStale = openHours > 8

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Chấm công</h1>
          {canConfig && (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="shrink-0"
              title="Cấu hình vị trí chấm công"
            >
              <Link to="/attendance-config">
                <Settings className="size-5" />
                <span className="sr-only">Cấu hình vị trí chấm công</span>
              </Link>
            </Button>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Chấm công theo công trình hoặc theo công ty. Bật định vị GPS và chụp
          ảnh trực tiếp tại chỗ — hệ thống tự kiểm tra bạn có đúng vị trí hay
          không. Mỗi ca làm xong hãy chấm công ra; muốn làm ca mới thì chấm công
          ra rồi chấm công vào lại.
        </p>
      </div>

      {/* Status hero */}
      <div
        className={`rounded-xl border p-5 ${
          openRecord
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
            : "bg-muted/40"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-11 items-center justify-center rounded-full ${
                openRecord
                  ? "bg-emerald-500 text-white"
                  : "bg-background text-muted-foreground border"
              }`}
            >
              {openRecord ? (
                <Navigation className="size-5" />
              ) : (
                <Clock className="size-5" />
              )}
            </div>
            <div>
              <div className="font-semibold">
                {openRecord ? "Đang làm việc" : "Chưa chấm công"}
              </div>
              <div className="text-muted-foreground text-sm">
                {openRecord
                  ? `${openProjectName} · vào lúc ${fmtTime(openRecord.check_in_at)}`
                  : "Hãy chọn công trình để bắt đầu"}
              </div>
            </div>
          </div>
          {openRecord && canSeeValidity && (
            <Badge
              variant={openRecord.check_in_valid ? "secondary" : "destructive"}
              className="gap-1"
            >
              {openRecord.check_in_valid ? (
                <CheckCircle2 className="size-3" />
              ) : (
                <XCircle className="size-3" />
              )}
              {openRecord.check_in_valid ? "đúng vị trí" : "lệch vị trí"}
            </Badge>
          )}
        </div>
        {openStale && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 p-2.5 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Bạn đã làm hơn 8 tiếng — hãy chấm công ra ngay, nếu không hệ thống
              sẽ không tính giờ công hôm nay. Nếu làm thêm ca mới, hãy chấm công
              ra rồi chấm công vào lại để bắt đầu ca mới.
            </span>
          </div>
        )}
      </div>

      {/* Action card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {openRecord ? (
              <LogOut className="text-primary size-4" />
            ) : (
              <Clock className="text-primary size-4" />
            )}
            {openRecord ? "Chấm công ra" : "Chấm công vào"}
          </CardTitle>
          <CardDescription>
            {openRecord
              ? "Chụp ảnh khi rời nơi làm việc để kết thúc ca"
              : "Chọn nơi làm việc → chụp ảnh → bấm chấm công"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!openRecord && (
            <>
              {/* Mode: by project (default) or by company (ad-hoc help) */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "project" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setMode("project")}
                >
                  <Building2 className="size-4" /> Theo công trình
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "company" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setMode("company")}
                >
                  <Building className="size-4" /> Theo công ty
                </Button>
              </div>

              {mode === "project" ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Công trình</label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Chọn công trình bạn đang ở" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectsQuery.data?.length ? (
                        projectsQuery.data.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.code})
                          </SelectItem>
                        ))
                      ) : (
                        <div className="text-muted-foreground px-2 py-1.5 text-sm">
                          Bạn chưa thuộc dự án nào
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Công ty</label>
                    <Select
                      value={companySel}
                      onValueChange={(v) => {
                        if (v === "__new_customer__") {
                          setCustomerFormOpen(true)
                          return
                        }
                        setCompanySel(v)
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Chọn công ty bạn đang ở" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Công ty của tôi</SelectLabel>
                          {myCompaniesQuery.data?.length ? (
                            myCompaniesQuery.data.map((c) => (
                              <SelectItem key={c.id} value={`tenant:${c.id}`}>
                                {c.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="text-muted-foreground px-2 py-1.5 text-xs">
                              Bạn chưa thuộc công ty nào
                            </div>
                          )}
                        </SelectGroup>
                        {canViewCustomers && (
                          <SelectGroup>
                            <SelectLabel>Công ty khách hàng</SelectLabel>
                            {customerCompaniesQuery.data?.length
                              ? customerCompaniesQuery.data.map((c) => (
                                  <SelectItem
                                    key={c.id}
                                    value={`customer:${c.id}`}
                                  >
                                    {c.name}
                                    {c.site_lat == null
                                      ? " (chưa đặt vị trí)"
                                      : ""}
                                  </SelectItem>
                                ))
                              : null}
                            {canCreateCustomer && (
                              <SelectItem value="__new_customer__">
                                + Tạo công ty khách hàng mới
                              </SelectItem>
                            )}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Công việc</label>
                    <Input
                      value={taskLabel}
                      onChange={(e) => setTaskLabel(e.target.value)}
                      list="attendance-task-suggestions"
                      placeholder="vd: sửa ống nước"
                    />
                    <datalist id="attendance-task-suggestions">
                      {taskSuggestionsQuery.data?.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                    <p className="text-muted-foreground text-xs">
                      Mô tả việc bạn qua đây làm (tự nhập, không liên quan task
                      dự án).
                    </p>
                  </div>
                </>
              )}
            </>
          )}

          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <MapPin className="size-3" /> Bấm nút bên dưới để mở camera
          </p>

          <Button
            className="h-11 w-full text-base"
            disabled={busy}
            onClick={startFlow}
          >
            <Camera className="size-4" />
            {openRecord ? "Chấm công ra" : "Chấm công vào"}
          </Button>
        </CardContent>
      </Card>

      {/* Check-in/out flow: camera → confirm (photo + time) → result */}
      <Dialog
        open={flowOpen}
        onOpenChange={(o) => {
          if (!o) closeFlow()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {flowKind === "out" ? "Chấm công ra" : "Chấm công vào"}
            </DialogTitle>
            <DialogDescription>
              {flowPhase === "camera"
                ? "Chụp ảnh trực tiếp tại nơi làm việc."
                : flowPhase === "confirm"
                  ? "Kiểm tra lại ảnh rồi xác nhận để chấm công."
                  : "Đã ghi nhận chấm công."}
            </DialogDescription>
          </DialogHeader>

          {flowPhase === "camera" && (
            <CameraCapture
              key={cameraNonce}
              autoStart
              onCapture={(f) => {
                if (!f) return
                setPhoto(f)
                setCapturedAt(new Date())
                setFlowPhase("confirm")
              }}
            />
          )}

          {flowPhase === "confirm" && (
            <div className="space-y-3">
              {photoUrl && (
                <img
                  src={photoUrl}
                  alt="Ảnh chấm công"
                  className="h-56 w-full rounded-lg object-cover"
                />
              )}
              <div className="flex items-center gap-2 text-sm">
                <Clock className="text-muted-foreground size-4" />
                <span>
                  Thời gian:{" "}
                  <span className="font-medium">
                    {capturedAt
                      ? capturedAt.toLocaleString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                        })
                      : "—"}
                  </span>
                </span>
              </div>
              {geo.error && (
                <p className="text-destructive text-xs">{geo.error}</p>
              )}
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setPhoto(null)
                    setFlowPhase("camera")
                    setCameraNonce((n) => n + 1)
                  }}
                >
                  <RefreshCw className="size-4" /> Chụp lại
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={busy}
                  onClick={submitFlow}
                >
                  {busy ? "Đang xử lý…" : "Xác nhận chấm công"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {flowPhase === "result" && resultRecord && (
            <div className="space-y-3">
              {photoUrl && (
                <img
                  src={photoUrl}
                  alt="Ảnh chấm công"
                  className="h-56 w-full rounded-lg object-cover"
                />
              )}
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <span>
                  {flowKind === "out"
                    ? `Đã chấm công ra · ${resultRecord.work_hours ?? 0} giờ công`
                    : `Đã chấm công vào lúc ${fmtTime(resultRecord.check_in_at)}`}
                </span>
              </div>
              {/* Validity + distance: managers only. */}
              {canSeeValidity && (
                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    variant={
                      (
                        flowKind === "out"
                          ? resultRecord.check_out_valid
                          : resultRecord.check_in_valid
                      )
                        ? "secondary"
                        : "destructive"
                    }
                    className="gap-1"
                  >
                    {(
                      flowKind === "out"
                        ? resultRecord.check_out_valid
                        : resultRecord.check_in_valid
                    ) ? (
                      <CheckCircle2 className="size-3" />
                    ) : (
                      <XCircle className="size-3" />
                    )}
                    {(
                      flowKind === "out"
                        ? resultRecord.check_out_valid
                        : resultRecord.check_in_valid
                    )
                      ? "hợp lệ"
                      : "lệch vị trí"}
                  </Badge>
                  <span>
                    cách ~
                    {Math.round(
                      (flowKind === "out"
                        ? resultRecord.check_out_distance_m
                        : resultRecord.check_in_distance_m) ?? 0,
                    )}{" "}
                    m
                  </span>
                </div>
              )}
              <DialogFooter>
                <Button type="button" className="w-full" onClick={closeFlow}>
                  Đóng
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full create-customer form, reusable across the app */}
      <CustomerCompanyFormDialog
        open={customerFormOpen}
        onOpenChange={setCustomerFormOpen}
        defaultType="customer"
        lockType
        onSaved={(cc) => setCompanySel(`customer:${cc.id}`)}
      />

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="text-primary size-4" /> Lịch sử chấm công
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {myQuery.data?.data.length ? (
            myQuery.data.data.map((r) => (
              <div
                key={r.id}
                className="hover:bg-muted/40 flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {r.mode === "company" ? (
                      <Building className="text-muted-foreground size-3.5 shrink-0" />
                    ) : (
                      <Building2 className="text-muted-foreground size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{recordLocationName(r)}</span>
                  </div>
                  {r.task_label && (
                    <div className="text-muted-foreground truncate text-xs">
                      🔧 {r.task_label}
                    </div>
                  )}
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span>
                      {fmtTime(r.check_in_at)} → {fmtTime(r.check_out_at)}
                    </span>
                    {canSeeValidity && (
                      <span>· cách ~{Math.round(r.check_in_distance_m)} m</span>
                    )}
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
                </div>
                <div className="flex flex-col items-end gap-1">
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
                  {r.is_absent && (
                    <Badge
                      variant="destructive"
                      className="h-5 px-1.5 text-[10px]"
                    >
                      không tính giờ
                    </Badge>
                  )}
                  {r.is_capped && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      giới hạn 8h
                    </Badge>
                  )}
                  {canSeeValidity &&
                    (r.check_in_valid ? (
                      <Badge
                        variant="secondary"
                        className="h-5 gap-1 px-1.5 text-[10px]"
                      >
                        <CheckCircle2 className="size-2.5" /> hợp lệ
                      </Badge>
                    ) : (
                      <Badge
                        variant="destructive"
                        className="h-5 gap-1 px-1.5 text-[10px]"
                      >
                        <XCircle className="size-2.5" /> lệch
                      </Badge>
                    ))}
                </div>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
              <History className="size-8 opacity-40" />
              Chưa có bản ghi chấm công.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

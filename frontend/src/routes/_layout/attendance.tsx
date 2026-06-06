import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Crosshair,
  History,
  LogOut,
  MapPin,
  Navigation,
  Search,
  XCircle,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SiteMapPicker } from "@/components/Map/SiteMapPicker"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useGeolocation } from "@/hooks/useGeolocation"
import { useCan } from "@/hooks/useMyPermissions"
import {
  type AttendanceRecord,
  type ProjectLite,
  checkIn,
  checkOut,
  listMyAttendance,
  listProjectsForAttendance,
  setSiteLocation,
} from "@/modules/attendance/attendanceApi"
import {
  type GeocodeResult,
  geocodeAddress,
  parsePastedCoords,
} from "@/modules/attendance/geocode"

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
  const [projectId, setProjectId] = useState<string>("")
  const fileRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const projectsQuery = useQuery({
    queryKey: ["attendance-projects"],
    queryFn: listProjectsForAttendance,
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

  function pickPhoto(f: File | null) {
    setPhoto(f)
    setPhotoPreview(f ? URL.createObjectURL(f) : null)
  }

  function resetForm() {
    setPhoto(null)
    setPhotoPreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Hãy chọn công trình")
      if (!photo) throw new Error("Hãy chụp ảnh tại công trình")
      const fix = await geo.locate()
      return checkIn({
        projectId,
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracy,
        file: photo,
      })
    },
    onSuccess: (rec) => {
      toast.success(
        rec.check_in_valid
          ? "Đã chấm công vào — đúng vị trí công trình ✅"
          : "Đã ghi nhận check-in nhưng vị trí lệch khỏi công trình ⚠️",
      )
      resetForm()
      qc.invalidateQueries({ queryKey: ["attendance-me"] })
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? e?.message ?? "Chấm công thất bại"),
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
      resetForm()
      qc.invalidateQueries({ queryKey: ["attendance-me"] })
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? e?.message ?? "Check-out thất bại"),
  })

  const busy = checkInMutation.isPending || checkOutMutation.isPending || geo.loading

  const openProjectName = openRecord
    ? (projectsById.get(openRecord.project_id) ?? "Công trình")
    : null

  // A shift open longer than the 8h cap means the worker likely forgot to
  // check out; warn them (the server will cap hours at 8h on check-out).
  const openHours = openRecord
    ? (Date.now() - new Date(openRecord.check_in_at).getTime()) / 3_600_000
    : 0
  const openStale = openHours > 8

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chấm công công trình</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bật định vị GPS và chụp ảnh tại chỗ. Hệ thống tự kiểm tra bạn có đúng ở
          công trình hay không.
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
          {openRecord && (
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
              Ca này đã mở hơn 8 tiếng — có thể bạn quên chấm công ra. Hãy chấm
              công ra ngay; giờ công sẽ được giới hạn ở mức 8 tiếng.
            </span>
          </div>
        )}
      </div>

      {canConfig && <SiteConfigCard projects={projectsQuery.data ?? []} />}

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
              ? "Chụp ảnh khi rời công trình để kết thúc ca"
              : "Chọn công trình → chụp ảnh → bấm chấm công"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!openRecord && (
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
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Ảnh tại công trình</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
            />
            {photoPreview ? (
              <div className="relative">
                <img
                  src={photoPreview}
                  alt="preview"
                  className="h-48 w-full rounded-lg object-cover"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-2 right-2"
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className="size-4" /> Chụp lại
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="border-muted-foreground/30 hover:border-primary hover:bg-muted/40 flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm transition-colors"
              >
                <Camera className="text-muted-foreground size-6" />
                <span className="text-muted-foreground">Bấm để chụp ảnh</span>
              </button>
            )}
          </div>

          {/* GPS status pill */}
          <div className="flex items-center gap-2 text-xs">
            {geo.error ? (
              <span className="text-destructive flex items-center gap-1">
                <XCircle className="size-3.5" /> {geo.error}
              </span>
            ) : geo.fix ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <MapPin className="size-3" /> GPS sẵn sàng · sai số ~
                {Math.round(geo.fix.accuracy)} m
              </span>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1">
                <MapPin className="size-3" /> Vị trí GPS sẽ được lấy khi chấm công
              </span>
            )}
          </div>

          <Button
            className="h-11 w-full text-base"
            disabled={busy}
            onClick={() =>
              openRecord
                ? checkOutMutation.mutate()
                : checkInMutation.mutate()
            }
          >
            {busy
              ? "Đang xử lý…"
              : openRecord
                ? "Chấm công ra"
                : "Chấm công vào"}
          </Button>
        </CardContent>
      </Card>

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
                    <Building2 className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="truncate">
                      {projectsById.get(r.project_id) ?? "Công trình"}
                    </span>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span>
                      {fmtTime(r.check_in_at)} → {fmtTime(r.check_out_at)}
                    </span>
                    <span>· cách ~{Math.round(r.check_in_distance_m)} m</span>
                    {r.is_auto_closed && (
                      <span className="text-amber-600">· tự đóng (quên check-out)</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`text-sm font-semibold ${
                      r.work_hours == null
                        ? r.is_auto_closed
                          ? "text-amber-600"
                          : "text-emerald-600"
                        : ""
                    }`}
                  >
                    {r.work_hours != null
                      ? `${r.work_hours} giờ`
                      : r.is_auto_closed
                        ? "chờ xác nhận"
                        : "đang mở"}
                  </span>
                  {r.is_capped && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      giới hạn 8h
                    </Badge>
                  )}
                  {r.check_in_valid ? (
                    <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
                      <CheckCircle2 className="size-2.5" /> hợp lệ
                    </Badge>
                  ) : (
                    <Badge
                      variant="destructive"
                      className="h-5 gap-1 px-1.5 text-[10px]"
                    >
                      <XCircle className="size-2.5" /> lệch
                    </Badge>
                  )}
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

/**
 * Manager-only card to configure a project's site coordinates + allowed radius.
 * "Lấy vị trí hiện tại" captures the manager's GPS while standing at the site.
 */
function SiteConfigCard({ projects }: { projects: ProjectLite[] }) {
  const qc = useQueryClient()
  const geo = useGeolocation()
  const [projectId, setProjectId] = useState<string>("")
  const [lat, setLat] = useState<string>("")
  const [lng, setLng] = useState<string>("")
  const [radius, setRadius] = useState<string>("150")
  const [mode, setMode] = useState<"address" | "coords">("address")
  const [addressInput, setAddressInput] = useState<string>("")
  const [pasteInput, setPasteInput] = useState<string>("")
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([])

  const searchMutation = useMutation({
    mutationFn: () => geocodeAddress(addressInput),
    onSuccess: (results) => {
      setGeoResults(results)
      if (results.length === 0) toast.error("Không tìm thấy địa chỉ")
    },
    onError: (e: any) => toast.error(e?.message ?? "Tìm địa chỉ thất bại"),
  })

  function applyResult(r: GeocodeResult) {
    setLat(r.lat.toFixed(6))
    setLng(r.lng.toFixed(6))
    setGeoResults([])
    setAddressInput(r.label)
  }

  function applyPaste(text: string) {
    setPasteInput(text)
    const parsed = parsePastedCoords(text)
    if (parsed) {
      setLat(parsed.lat.toFixed(6))
      setLng(parsed.lng.toFixed(6))
    }
  }

  const selected = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  )

  // Load existing site config when a project is picked.
  useEffect(() => {
    if (!selected) return
    setLat(selected.site_lat != null ? String(selected.site_lat) : "")
    setLng(selected.site_lng != null ? String(selected.site_lng) : "")
    setRadius(String(selected.site_radius_m ?? 150))
  }, [selected])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Hãy chọn công trình")
      const latN = lat.trim() === "" ? null : Number(lat)
      const lngN = lng.trim() === "" ? null : Number(lng)
      if ((latN === null) !== (lngN === null))
        throw new Error("Cần nhập cả vĩ độ và kinh độ")
      if (latN !== null && (Number.isNaN(latN) || Number.isNaN(lngN!)))
        throw new Error("Toạ độ không hợp lệ")
      const radN = Number(radius)
      if (Number.isNaN(radN) || radN < 10) throw new Error("Bán kính tối thiểu 10m")
      return setSiteLocation({
        projectId,
        siteLat: latN,
        siteLng: lngN,
        siteRadiusM: radN,
      })
    },
    onSuccess: () => {
      toast.success("Đã lưu vị trí công trình")
      qc.invalidateQueries({ queryKey: ["attendance-projects"] })
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? e?.message ?? "Lưu thất bại"),
  })

  async function useCurrentLocation() {
    try {
      const fix = await geo.locate()
      setLat(String(fix.lat))
      setLng(String(fix.lng))
      toast.success(`Đã lấy vị trí (sai số ~${Math.round(fix.accuracy)} m)`)
    } catch {
      /* error already surfaced by hook */
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4" /> Cấu hình vị trí công trình (Quản lý)
        </CardTitle>
        <CardDescription>
          Đặt toạ độ tâm công trình và bán kính cho phép chấm công.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger>
            <SelectValue placeholder="Chọn công trình" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.code})
                {p.site_lat != null ? " ✓" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {projectId && (
          <>
            {/* Two ways to set the centre: search address, or paste coords */}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "address" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMode("address")}
              >
                Theo địa chỉ
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "coords" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMode("coords")}
              >
                Theo toạ độ
              </Button>
            </div>

            {mode === "address" ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        searchMutation.mutate()
                      }
                    }}
                    placeholder="Nhập địa chỉ công trình…"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={searchMutation.isPending || !addressInput.trim()}
                    onClick={() => searchMutation.mutate()}
                  >
                    <Search className="size-4" />
                  </Button>
                </div>
                {geoResults.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-1">
                    {geoResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        className="hover:bg-accent block w-full rounded px-2 py-1 text-left text-xs"
                        onClick={() => applyResult(r)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  value={pasteInput}
                  onChange={(e) => applyPaste(e.target.value)}
                  placeholder="Dán toạ độ từ Google Maps, vd: 10.762622, 106.660172"
                />
                <p className="text-muted-foreground text-xs">
                  Trên Google Maps: chuột phải vào điểm → bấm vào cặp số toạ độ để
                  copy, rồi dán vào đây.
                </p>
              </div>
            )}

            <p className="text-muted-foreground text-xs">
              Bấm lên bản đồ hoặc kéo ghim để tinh chỉnh. Vòng tròn là bán kính cho
              phép chấm công.
            </p>
            <SiteMapPicker
              value={
                lat.trim() !== "" &&
                lng.trim() !== "" &&
                !Number.isNaN(Number(lat)) &&
                !Number.isNaN(Number(lng))
                  ? { lat: Number(lat), lng: Number(lng) }
                  : null
              }
              radiusM={Number(radius) || 150}
              onChange={(p) => {
                setLat(p.lat.toFixed(6))
                setLng(p.lng.toFixed(6))
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium">Vĩ độ (lat)</label>
                <Input
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="vd 10.762622"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Kinh độ (lng)</label>
                <Input
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="vd 106.660172"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Bán kính cho phép (m)</label>
              <Input
                type="number"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={geo.loading}
              onClick={useCurrentLocation}
            >
              <Crosshair className="size-4" />
              {geo.loading ? "Đang lấy vị trí…" : "Lấy vị trí hiện tại"}
            </Button>
            <Button
              className="w-full"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Đang lưu…" : "Lưu vị trí công trình"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

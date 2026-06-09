import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Building, Crosshair, MapPin, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { SiteMapPicker } from "@/components/Map/SiteMapPicker"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  type CompanyLite,
  listCompaniesForAttendance,
  listProjectsForAttendance,
  type ProjectLite,
  setCompanySiteLocation,
  setSiteLocation,
} from "@/modules/attendance/attendanceApi"
import {
  type GeocodeResult,
  geocodeAddress,
  parsePastedCoords,
} from "@/modules/attendance/geocode"

export const Route = createFileRoute("/_layout/attendance-config")({
  component: AttendanceConfigPage,
})

function AttendanceConfigPage() {
  const canConfig = useCan("ATTENDANCE_CONFIG_SITE")

  const projectsQuery = useQuery({
    queryKey: ["attendance-projects"],
    queryFn: listProjectsForAttendance,
    enabled: canConfig,
  })

  const companiesQuery = useQuery({
    queryKey: ["attendance-companies"],
    queryFn: listCompaniesForAttendance,
    enabled: canConfig,
  })

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 pb-10">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8 gap-1">
          <Link to="/attendance">
            <ArrowLeft className="size-4" /> Quay lại chấm công
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cấu hình vị trí chấm công
        </h1>
        <p className="text-muted-foreground text-sm">
          Đặt toạ độ và bán kính cho phép chấm công của công trình và công ty.
        </p>
      </div>

      {!canConfig ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Bạn không có quyền cấu hình vị trí chấm công.
          </CardContent>
        </Card>
      ) : (
        <>
          <SiteConfigCard projects={projectsQuery.data ?? []} />
          <CompanySiteConfigCard companies={companiesQuery.data ?? []} />
        </>
      )}
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
      if (Number.isNaN(radN) || radN < 10)
        throw new Error("Bán kính tối thiểu 10m")
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
                {p.name} ({p.code}){p.site_lat != null ? " ✓" : ""}
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
                  Trên Google Maps: chuột phải vào điểm → bấm vào cặp số toạ độ
                  để copy, rồi dán vào đây.
                </p>
              </div>
            )}

            <p className="text-muted-foreground text-xs">
              Bấm lên bản đồ hoặc kéo ghim để tinh chỉnh. Vòng tròn là bán kính
              cho phép chấm công.
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
              <label className="text-xs font-medium">
                Bán kính cho phép (m)
              </label>
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

/**
 * Manager-only card to configure a COMPANY's site coordinates + radius, used to
 * validate by-company check-ins (a worker helping out at another site).
 */
function CompanySiteConfigCard({ companies }: { companies: CompanyLite[] }) {
  const qc = useQueryClient()
  const geo = useGeolocation()
  const [companyId, setCompanyId] = useState<string>("")
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
    () => companies.find((c) => c.id === companyId),
    [companies, companyId],
  )

  useEffect(() => {
    if (!selected) return
    setLat(selected.site_lat != null ? String(selected.site_lat) : "")
    setLng(selected.site_lng != null ? String(selected.site_lng) : "")
    setRadius(String(selected.site_radius_m ?? 150))
  }, [selected])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Hãy chọn công ty")
      const latN = lat.trim() === "" ? null : Number(lat)
      const lngN = lng.trim() === "" ? null : Number(lng)
      if ((latN === null) !== (lngN === null))
        throw new Error("Cần nhập cả vĩ độ và kinh độ")
      if (latN !== null && (Number.isNaN(latN) || Number.isNaN(lngN!)))
        throw new Error("Toạ độ không hợp lệ")
      const radN = Number(radius)
      if (Number.isNaN(radN) || radN < 10)
        throw new Error("Bán kính tối thiểu 10m")
      return setCompanySiteLocation({
        companyId,
        siteLat: latN,
        siteLng: lngN,
        siteRadiusM: radN,
      })
    },
    onSuccess: () => {
      toast.success("Đã lưu vị trí công ty")
      qc.invalidateQueries({ queryKey: ["attendance-companies"] })
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
          <Building className="size-4" /> Cấu hình vị trí công ty (Quản lý)
        </CardTitle>
        <CardDescription>
          Đặt toạ độ trụ sở/công ty và bán kính cho phép chấm công theo công ty.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger>
            <SelectValue placeholder="Chọn công ty" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.site_lat != null ? " ✓" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {companyId && (
          <>
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
                    placeholder="Nhập địa chỉ công ty…"
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
                  Trên Google Maps: chuột phải vào điểm → bấm vào cặp số toạ độ
                  để copy, rồi dán vào đây.
                </p>
              </div>
            )}

            <p className="text-muted-foreground text-xs">
              Bấm lên bản đồ hoặc kéo ghim để tinh chỉnh. Vòng tròn là bán kính
              cho phép chấm công.
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
              <label className="text-xs font-medium">
                Bán kính cho phép (m)
              </label>
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
              {saveMutation.isPending ? "Đang lưu…" : "Lưu vị trí công ty"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

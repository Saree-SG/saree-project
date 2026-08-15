import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import L from "leaflet"
import { useEffect, useMemo, useRef, useState } from "react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"
import "leaflet.markercluster"
import useAuth from "@/hooks/useAuth"
import {
  fetchAllCompanies,
  fetchMapOverview,
  type MapOverviewData,
  type MapStaff,
} from "@/modules/dashboard/dashboardApi"

export const Route = createFileRoute("/_layout/map")({
  component: MapPage,
})

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
  ._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

// Site: hình vuông bo góc với icon 🏗 + % — dễ phân biệt với staff dot
function siteIcon(status: string, pct: number) {
  const bg =
    status === "completed"
      ? "#6b7280"
      : status === "active"
        ? "#2563eb"
        : status === "planning"
          ? "#d97706"
          : status === "on_hold"
            ? "#dc2626"
            : "#2563eb"
  const bar = Math.round(pct)
  const svg = `<div style="
    display:flex;flex-direction:column;align-items:center;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));
  ">
    <div style="
      background:${bg};color:#fff;border-radius:8px;
      padding:4px 8px;font-size:12px;font-weight:800;
      white-space:nowrap;border:2.5px solid white;min-width:44px;text-align:center;
    ">🏗 ${bar}%</div>
    <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid ${bg};margin-top:-1px"></div>
  </div>`
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [70, 40],
    iconAnchor: [35, 40],
    popupAnchor: [0, -40],
  })
}

// Customer: icon nhà máy hình vuông xanh lá — trông khác hẳn site và staff
function customerIcon() {
  const svg = `<div style="
    background:#059669;color:#fff;border-radius:6px;
    width:28px;height:28px;display:flex;align-items:center;justify-content:center;
    font-size:14px;border:2.5px solid white;
    box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;
  ">🏢</div>`
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

// Staff: hình người — màu phân biệt rõ trạng thái, to hơn
function staffDot(status: string) {
  const [bg, emoji] =
    status === "working"
      ? ["#ea580c", "👷"]
      : status === "leave"
        ? ["#dc2626", "🏠"]
        : ["#16a34a", "👤"]
  const svg = `<div style="
    background:${bg};color:#fff;border-radius:50%;
    width:26px;height:26px;display:flex;align-items:center;justify-content:center;
    font-size:13px;border:2.5px solid white;
    box-shadow:0 2px 5px rgba(0,0,0,0.35);cursor:pointer;
  ">${emoji}</div>`
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
}

// Jitter tọa độ để các staff free không chồng nhau
function jitter(lat: number, lng: number, seed: number): [number, number] {
  const r = (((seed * 9301 + 49297) % 233280) / 233280) * 0.012 - 0.006
  const r2 = (((seed * 49297 + 9301) % 233280) / 233280) * 0.012 - 0.006
  return [lat + r, lng + r2]
}

function jitteredStaff(
  staffList: MapStaff[],
): Array<MapStaff & { jLat: number; jLng: number }> {
  return staffList.map((s, i) => {
    const [jLat, jLng] =
      s.loc_source === "province"
        ? jitter(s.lat, s.lng, i * 7 + 3)
        : [s.lat, s.lng]
    return { ...s, jLat, jLng }
  })
}

// ── Cluster layers (imperative Leaflet, mounted inside MapContainer) ──────────

type SiteItem = {
  project_id: string
  lat: number
  lng: number
  name: string
  status: string
  progress_pct: number
  staff_count: number
}
type CustomerItem = {
  id: string
  lat: number
  lng: number
  name: string
  phone?: string
  address?: string
}
type StaffItem = MapStaff & { jLat: number; jLng: number }

function SiteClusterLayer({ sites }: { sites: SiteItem[] }) {
  const map = useMap()
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)

  useEffect(() => {
    if (groupRef.current) {
      map.removeLayer(groupRef.current)
    }
    const group = (L as any).markerClusterGroup({
      maxClusterRadius: 50,
      iconCreateFunction: (cluster: L.MarkerCluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div style="background:#2563eb;color:#fff;border-radius:10px;padding:3px 10px;font-size:12px;font-weight:800;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">🏗 ${count}</div>`,
          className: "",
          iconSize: [60, 30],
          iconAnchor: [30, 30],
        })
      },
    })
    for (const site of sites) {
      const marker = L.marker([site.lat, site.lng], {
        icon: siteIcon(site.status, site.progress_pct),
      })
      marker.bindPopup(`
        <div style="min-width:170px">
          <p style="font-weight:700;margin-bottom:4px;font-size:13px">${site.name}</p>
          <p style="font-size:12px">Tiến độ: <b>${site.progress_pct}%</b></p>
          <p style="font-size:12px">Trạng thái: ${site.status}</p>
          <p style="font-size:12px">Nhân sự hôm nay: ${site.staff_count}</p>
        </div>`)
      group.addLayer(marker)
    }
    map.addLayer(group)
    groupRef.current = group
    return () => {
      map.removeLayer(group)
    }
  }, [map, sites])

  return null
}

function CustomerClusterLayer({ customers }: { customers: CustomerItem[] }) {
  const map = useMap()
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)

  useEffect(() => {
    if (groupRef.current) {
      map.removeLayer(groupRef.current)
    }
    const group = (L as any).markerClusterGroup({
      maxClusterRadius: 40,
      iconCreateFunction: (cluster: L.MarkerCluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div style="background:#059669;color:#fff;border-radius:8px;padding:3px 9px;font-size:12px;font-weight:800;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">🏢 ${count}</div>`,
          className: "",
          iconSize: [55, 28],
          iconAnchor: [27, 28],
        })
      },
    })
    for (const c of customers) {
      const marker = L.marker([c.lat, c.lng], { icon: customerIcon() })
      marker.bindPopup(`
        <div style="min-width:140px">
          <p style="font-weight:700;margin-bottom:4px;font-size:13px">${c.name}</p>
          ${c.phone ? `<p style="font-size:12px">ĐT: ${c.phone}</p>` : ""}
          ${c.address ? `<p style="font-size:12px">${c.address}</p>` : ""}
        </div>`)
      group.addLayer(marker)
    }
    map.addLayer(group)
    groupRef.current = group
    return () => {
      map.removeLayer(group)
    }
  }, [map, customers])

  return null
}

function StaffClusterLayer({ staffList }: { staffList: StaffItem[] }) {
  const map = useMap()
  const groupRef = useRef<L.MarkerClusterGroup | null>(null)

  useEffect(() => {
    if (groupRef.current) {
      map.removeLayer(groupRef.current)
    }
    const group = (L as any).markerClusterGroup({
      maxClusterRadius: 35,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster: L.MarkerCluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div style="background:#ea580c;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">👷${count}</div>`,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })
      },
    })
    for (const s of staffList) {
      const statusLabel =
        s.status === "working"
          ? "👷 Đang làm việc"
          : s.status === "leave"
            ? "🏠 Nghỉ phép"
            : "👤 Rảnh"
      const locLabel =
        s.loc_source === "task"
          ? "task đang làm"
          : s.loc_source === "attendance"
            ? "GPS chấm công"
            : "Mặc định (HQ)"
      const marker = L.marker([s.jLat, s.jLng], { icon: staffDot(s.status) })
      marker.bindPopup(`
        <div style="min-width:150px">
          <p style="font-weight:700;margin-bottom:3px;font-size:13px">${s.name}</p>
          <p style="font-size:12px">${statusLabel}</p>
          <p style="color:#9ca3af;font-size:11px;margin-top:4px">Vị trí: ${locLabel}</p>
        </div>`)
      group.addLayer(marker)
    }
    map.addLayer(group)
    groupRef.current = group
    return () => {
      map.removeLayer(group)
    }
  }, [map, staffList])

  return null
}

type LayerKey = "sites" | "customers" | "staff"

function LayerBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${
        active
          ? "border-blue-500 bg-blue-500 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  )
}

function MapPage() {
  const { user } = useAuth()
  const isSuperuser = user?.is_superuser ?? false
  const [companyId, setCompanyId] = useState<string | undefined>(undefined)
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    sites: true,
    customers: true,
    staff: true,
  })

  function toggleLayer(k: LayerKey) {
    setLayers((prev) => ({ ...prev, [k]: !prev[k] }))
  }

  const companies = useQuery({
    queryKey: ["companies-all"],
    queryFn: fetchAllCompanies,
    enabled: isSuperuser,
  })

  const mapQuery = useQuery<MapOverviewData>({
    queryKey: ["dashboard-map", companyId],
    queryFn: () => fetchMapOverview(companyId),
    refetchInterval: 60_000,
  })

  const data = mapQuery.data
  const sites = useMemo(
    () => (data?.sites ?? []).filter((s) => s.lat && s.lng),
    [data],
  )
  const customers = useMemo(
    () => (data?.customers ?? []).filter((c) => c.lat && c.lng),
    [data],
  )
  const staffAll = useMemo(() => jitteredStaff(data?.staff ?? []), [data])

  const staffWorking = staffAll.filter((s) => s.status === "working").length
  const staffFree = staffAll.filter((s) => s.status === "free").length

  // Tính map center từ sites (nếu có) hoặc default
  const center = useMemo((): [number, number] => {
    const withCoords = sites.filter((s) => s.lat && s.lng)
    if (withCoords.length === 0) return [10.7399343, 106.5857629]
    const avgLat =
      withCoords.reduce((a, s) => a + s.lat!, 0) / withCoords.length
    const avgLng =
      withCoords.reduce((a, s) => a + s.lng!, 0) / withCoords.length
    return [avgLat, avgLng]
  }, [sites])

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 60px)" }}>
      {/* Header — compact mobile-first */}
      <div className="flex-shrink-0 border-b bg-white px-3 py-2 md:px-4 md:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-800 md:text-lg">
              Sơ đồ vị trí
            </h1>
            <p className="truncate text-[11px] text-slate-400 md:text-xs">
              {sites.length} công trình · {staffAll.length} nhân sự
              <span className="text-orange-500">
                {" "}
                · {staffWorking} đang làm
              </span>
              <span className="text-green-600"> · {staffFree} rảnh</span>
            </p>
          </div>

          {/* Company selector — chỉ hiện cho superuser */}
          {isSuperuser && companies.data && companies.data.length > 1 && (
            <select
              value={companyId ?? ""}
              onChange={(e) => setCompanyId(e.target.value || undefined)}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tất cả công ty</option>
              {companies.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Layer filter */}
        <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
          <LayerBtn
            label="🏗 Công trình"
            active={layers.sites}
            onClick={() => toggleLayer("sites")}
          />
          <LayerBtn
            label="🏢 Khách hàng"
            active={layers.customers}
            onClick={() => toggleLayer("customers")}
          />
          <LayerBtn
            label="👷 Nhân sự"
            active={layers.staff}
            onClick={() => toggleLayer("staff")}
          />
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        {mapQuery.isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-slate-500">
            Đang tải bản đồ...
          </div>
        )}
        {mapQuery.error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-red-500">
            Không thể tải dữ liệu bản đồ.
          </div>
        )}
        <MapContainer
          key={`${center[0]}-${center[1]}`}
          center={center}
          zoom={sites.length > 1 ? 8 : 10}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />

          {layers.sites && <SiteClusterLayer sites={sites as SiteItem[]} />}
          {layers.customers && (
            <CustomerClusterLayer customers={customers as CustomerItem[]} />
          )}
          {layers.staff && (
            <StaffClusterLayer staffList={staffAll as StaffItem[]} />
          )}
        </MapContainer>
      </div>
    </div>
  )
}

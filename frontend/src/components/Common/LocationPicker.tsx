import { useMutation } from "@tanstack/react-query"
import { Crosshair, Search } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { SiteMapPicker } from "@/components/Map/SiteMapPicker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useGeolocation } from "@/hooks/useGeolocation"
import {
  type GeocodeResult,
  geocodeAddress,
  parsePastedCoords,
} from "@/modules/attendance/geocode"

export type LocationValue = {
  lat: number | null
  lng: number | null
  radiusM: number
}

/**
 * Reusable site-location editor: address geocoding, paste-from-Maps coords, a
 * draggable map pin with a radius circle, manual lat/lng inputs and a
 * "use current location" button. Controlled via `value` / `onChange`.
 *
 * Mirrors the editor used for project/company attendance site config in
 * routes/_layout/attendance.tsx, factored out for reuse on the /company page.
 */
export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationValue
  onChange: (next: LocationValue) => void
}) {
  const geo = useGeolocation()
  const [mode, setMode] = useState<"address" | "coords">("address")
  const [addressInput, setAddressInput] = useState("")
  const [pasteInput, setPasteInput] = useState("")
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([])

  const latStr = value.lat != null ? String(value.lat) : ""
  const lngStr = value.lng != null ? String(value.lng) : ""

  const searchMutation = useMutation({
    mutationFn: () => geocodeAddress(addressInput),
    onSuccess: (results) => {
      setGeoResults(results)
      if (results.length === 0) toast.error("Không tìm thấy địa chỉ")
    },
    onError: (e: any) => toast.error(e?.message ?? "Tìm địa chỉ thất bại"),
  })

  function setCoords(lat: number | null, lng: number | null) {
    onChange({ ...value, lat, lng })
  }

  function applyResult(r: GeocodeResult) {
    setCoords(Number(r.lat.toFixed(6)), Number(r.lng.toFixed(6)))
    setGeoResults([])
    setAddressInput(r.label)
  }

  function applyPaste(text: string) {
    setPasteInput(text)
    const parsed = parsePastedCoords(text)
    if (parsed)
      setCoords(Number(parsed.lat.toFixed(6)), Number(parsed.lng.toFixed(6)))
  }

  async function useCurrentLocation() {
    try {
      const fix = await geo.locate()
      setCoords(Number(fix.lat.toFixed(6)), Number(fix.lng.toFixed(6)))
      toast.success(`Đã lấy vị trí (sai số ~${Math.round(fix.accuracy)} m)`)
    } catch {
      /* error already surfaced by hook */
    }
  }

  return (
    <div className="space-y-3">
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
          value.lat != null && value.lng != null
            ? { lat: value.lat, lng: value.lng }
            : null
        }
        radiusM={value.radiusM || 150}
        onChange={(p) =>
          setCoords(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)))
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Vĩ độ (lat)</label>
          <Input
            value={latStr}
            onChange={(e) =>
              setCoords(
                e.target.value.trim() === "" ? null : Number(e.target.value),
                value.lng,
              )
            }
            placeholder="vd 10.762622"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Kinh độ (lng)</label>
          <Input
            value={lngStr}
            onChange={(e) =>
              setCoords(
                value.lat,
                e.target.value.trim() === "" ? null : Number(e.target.value),
              )
            }
            placeholder="vd 106.660172"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Bán kính cho phép (m)</label>
        <Input
          type="number"
          value={String(value.radiusM)}
          onChange={(e) =>
            onChange({ ...value, radiusM: Number(e.target.value) || 0 })
          }
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
    </div>
  )
}

import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useEffect, useMemo, useRef } from "react"
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"

// Fix default marker icons not loading under bundlers (Vite).
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

type LatLng = { lat: number; lng: number }

function ClickHandler({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

/** Recenter the map when the external value changes (e.g. "use current location"). */
function Recenter({ value }: { value: LatLng | null }) {
  const map = useMap()
  const last = useRef<string>("")
  useEffect(() => {
    if (!value) return
    const key = `${value.lat},${value.lng}`
    if (key === last.current) return
    last.current = key
    map.setView([value.lat, value.lng], map.getZoom())
  }, [value, map])
  return null
}

export type SiteMapPickerProps = {
  value: LatLng | null
  radiusM: number
  onChange: (p: LatLng) => void
  className?: string
}

/**
 * Free OpenStreetMap-based picker. Click or drag the marker to set the site
 * centre; a circle visualises the allowed check-in radius.
 */
export function SiteMapPicker({
  value,
  radiusM,
  onChange,
  className,
}: SiteMapPickerProps) {
  // Default centre: Ho Chi Minh City when nothing chosen yet.
  const center = useMemo<LatLng>(
    () => value ?? { lat: 10.762622, lng: 106.660172 },
    [value],
  )

  return (
    <div
      className={className ?? "h-64 w-full overflow-hidden rounded-md border"}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={value ? 17 : 12}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onChange} />
        <Recenter value={value} />
        {value && (
          <>
            <Marker
              position={[value.lat, value.lng]}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend(e) {
                  const m = e.target as L.Marker
                  const p = m.getLatLng()
                  onChange({ lat: p.lat, lng: p.lng })
                },
              }}
            />
            <Circle
              center={[value.lat, value.lng]}
              radius={radiusM}
              pathOptions={{ color: "#2563eb", fillOpacity: 0.1 }}
            />
          </>
        )}
      </MapContainer>
    </div>
  )
}

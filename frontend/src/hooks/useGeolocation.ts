import { useCallback, useState } from "react"

export type GeoFix = {
  lat: number
  lng: number
  accuracy: number // metres (coords.accuracy)
}

type GeoState = {
  loading: boolean
  fix: GeoFix | null
  error: string | null
}

/**
 * Browser Geolocation wrapper for on-site check-in.
 *
 * Uses `enableHighAccuracy: true` so mobile devices engage the GPS chip
 * (≈5–20 m outdoors) instead of coarse WiFi/IP positioning. The reported
 * `accuracy` is surfaced to the caller so the UI/server can reject unreliable
 * fixes (e.g. a desktop reporting hundreds of metres).
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({
    loading: false,
    fix: null,
    error: null,
  })

  const locate = useCallback((): Promise<GeoFix> => {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        const msg = "Thiết bị không hỗ trợ định vị GPS"
        setState({ loading: false, fix: null, error: msg })
        reject(new Error(msg))
        return
      }
      setState((s) => ({ ...s, loading: true, error: null }))
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const fix: GeoFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }
          setState({ loading: false, fix, error: null })
          resolve(fix)
        },
        (err) => {
          const msg =
            err.code === err.PERMISSION_DENIED
              ? "Bạn cần cho phép truy cập vị trí để chấm công"
              : err.code === err.TIMEOUT
                ? "Không lấy được vị trí (quá thời gian). Hãy ra nơi thoáng và thử lại"
                : "Không lấy được vị trí GPS"
          setState({ loading: false, fix: null, error: msg })
          reject(new Error(msg))
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    })
  }, [])

  return { ...state, locate }
}

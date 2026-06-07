import { Camera, RefreshCw, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

/**
 * Live-only camera capture for attendance photos.
 *
 * Uses `getUserMedia` (not an <input type=file>) so the worker MUST take a
 * fresh photo on the spot — there is no way to pick an existing image from the
 * gallery, which is the whole point for anti-fraud attendance. The captured
 * frame is returned as a JPEG File via `onCapture`.
 *
 * Falls back to a `capture`-hinted file input only if the device/browser
 * denies camera access entirely (e.g. unsupported, or permission blocked), so
 * the user is never hard-stuck.
 */
export function CameraCapture({
  onCapture,
  facingMode = "environment",
  autoStart = false,
}: {
  onCapture: (file: File | null) => void
  facingMode?: "environment" | "user"
  /** Open the camera immediately on mount (e.g. when shown inside a dialog
   * already triggered by a user tap). */
  autoStart?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fallbackRef = useRef<HTMLInputElement>(null)
  const startedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const stop = useCallback(() => {
    for (const t of streamRef.current?.getTracks() ?? []) t.stop()
    streamRef.current = null
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      })
      streamRef.current = stream
      setOpen(true)
      // Attach after the element is mounted.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
      })
    } catch {
      // Camera unavailable / denied → fall back to a capture-hinted file input.
      setError(
        "Không mở được camera. Hãy cho phép quyền camera, hoặc dùng nút bên dưới.",
      )
      fallbackRef.current?.click()
    } finally {
      setStarting(false)
    }
  }, [facingMode])

  useEffect(() => () => stop(), [stop])

  // Auto-open the camera once when requested (the parent dialog was opened by a
  // user tap, so the gesture is still fresh enough for getUserMedia).
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true
      void start()
    }
  }, [autoStart, start])

  function shoot() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `checkin-${Date.now()}.jpg`, {
          type: "image/jpeg",
        })
        if (preview) URL.revokeObjectURL(preview)
        setPreview(URL.createObjectURL(file))
        onCapture(file)
        stop()
        setOpen(false)
      },
      "image/jpeg",
      0.9,
    )
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    onCapture(null)
    void start()
  }

  function onFallbackPick(file: File | null) {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(file ? URL.createObjectURL(file) : null)
    onCapture(file)
  }

  // Live camera viewfinder
  if (open) {
    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-64 w-full object-cover"
          >
            <track kind="captions" />
          </video>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2"
            onClick={() => {
              stop()
              setOpen(false)
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
        <Button type="button" className="h-11 w-full" onClick={shoot}>
          <Camera className="size-4" /> Chụp
        </Button>
      </div>
    )
  }

  // Preview after capture
  if (preview) {
    return (
      <div className="relative">
        <img
          src={preview}
          alt="Ảnh chấm công"
          className="h-48 w-full rounded-lg object-cover"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute bottom-2 right-2"
          onClick={retake}
        >
          <RefreshCw className="size-4" /> Chụp lại
        </Button>
      </div>
    )
  }

  // Idle → big "take photo" button
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={starting}
        onClick={start}
        className="border-muted-foreground/30 hover:border-primary hover:bg-muted/40 flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm transition-colors"
      >
        <Camera className="text-muted-foreground size-6" />
        <span className="text-muted-foreground">
          {starting ? "Đang mở camera…" : "Bấm để mở camera & chụp"}
        </span>
      </button>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {/* Fallback only: live capture on devices that block getUserMedia. */}
      <input
        ref={fallbackRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFallbackPick(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

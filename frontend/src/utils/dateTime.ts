export function toIsoFromLocalDateTime(raw: string): string | null {
  if (!raw.trim()) return null
  const normalized = raw.trim()
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized
  const parsed = new Date(withSeconds)
  if (Number.isNaN(parsed.getTime())) return null
  return withSeconds
}

export function toLocalDateTimeInputValue(raw: string | undefined): string {
  if (!raw) return ""
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ""
  const pad = (v: number) => String(v).padStart(2, "0")
  const yyyy = parsed.getFullYear()
  const mm = pad(parsed.getMonth() + 1)
  const dd = pad(parsed.getDate())
  const hh = pad(parsed.getHours())
  const min = pad(parsed.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

export function formatDateVN(isoString: string | undefined | null): string {
  if (!isoString) return "—"
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("vi-VN")
}

export function formatDateOnlyVN(isoString: string | undefined | null): string {
  if (!isoString) return "—"
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("vi-VN")
}

import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef } from "react"

import "./timeline-chart.css"

const DEFAULT_WEEK_PX = 80
const DAY_MS = 86_400_000
/** Indent per tree level in the label column — deliberately small, the column is
 *  narrow on a phone. */
const INDENT_PX = 10

const pad2 = (n: number) => String(n).padStart(2, "0")

export const fmtShortDate = (d: Date) =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`

/** Parse YYYY-MM-DD (or an ISO datetime) as local time, no timezone shift. */
export function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const rest = /T(\d{2}):(\d{2})/.exec(s)
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    rest ? Number(rest[1]) : 0,
    rest ? Number(rest[2]) : 0,
  )
  return Number.isNaN(d.getTime()) ? null : d
}

/** Week ruler label: "01/06-07/06". */
function fmtWeekRange(w: Date): string {
  const e = new Date(w)
  e.setDate(e.getDate() + 6)
  return `${fmtShortDate(w)}-${fmtShortDate(e)}`
}

/** Monday of the week containing d. */
function weekStart(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day))
  return x
}

export function todayLocal(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function dayCount(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1)
}

/** One rendered row. Callers flatten their tree into display order themselves. */
export type TimelineItem = {
  id: string
  /** Primary text in the label column (project code, task name). */
  label: string
  /** Text drawn on the bar; falls back to `label`. */
  barText?: string
  /** Tooltip; falls back to `label` + date range. */
  tooltip?: string
  start: Date
  end: Date
  progress: number
  color: string
  depth?: number
  hasChildren?: boolean
  collapsed?: boolean
}

/**
 * Build the shared time axis.
 *
 * Padding rules are ported from the client's demo and are what stop the chart
 * from ever looking empty: one week of lead-in before the earliest start, two
 * weeks of run-out after the latest end, and a floor of 5 weeks total.
 */
function buildAxis(items: TimelineItem[], weekPx: number) {
  let tMin: Date | null = null
  let tMax: Date | null = null
  for (const it of items) {
    if (!tMin || it.start < tMin) tMin = it.start
    if (!tMax || it.end > tMax) tMax = it.end
  }

  const today = todayLocal()
  if (!tMin || today < tMin) tMin = new Date(today)
  if (!tMax || today > tMax) tMax = new Date(today)

  const from = weekStart(tMin)
  from.setDate(from.getDate() - 7)
  const to = new Date(tMax)
  to.setDate(to.getDate() + 14)

  const weeks: Date[] = []
  for (const cur = new Date(from); cur <= to; cur.setDate(cur.getDate() + 7)) {
    weeks.push(new Date(cur))
  }
  while (weeks.length < 5) {
    const next = new Date(weeks[weeks.length - 1])
    next.setDate(next.getDate() + 7)
    weeks.push(next)
  }

  const axisStart = new Date(weeks[0])
  axisStart.setHours(0, 0, 0, 0)

  return {
    weeks,
    axisStart,
    trackWidth: weeks.length * weekPx,
    spanMs: weeks.length * 7 * DAY_MS,
  }
}

/** Zoom levels: width in px of one week column. The demo had no zoom — this is
 *  the one thing the SVAR view did better, kept here. */
export const WEEK_PX_BY_SCALE = { day: 160, week: 80, month: 40 } as const

/**
 * Temporarily unfold the chart so an image capture gets the WHOLE timeline.
 *
 * Needed because html-to-image clones the node with scrollLeft reset to 0: the
 * ruler would then be drawn from the axis start while the needle keeps the pixel
 * offset computed for the scrolled view, so the exported picture showed the wrong
 * date range with a needle pointing at the wrong day.
 *
 * Returns the element to capture, or null when there is no chart to export.
 */
export async function prepareTimelineExport(
  container: HTMLElement | null,
): Promise<{ element: HTMLElement; restore: () => void } | null> {
  const root = container?.classList.contains("tlc-root")
    ? container
    : (container?.querySelector<HTMLElement>(".tlc-root") ?? null)
  if (!root) return null

  const scrollers = Array.from(root.querySelectorAll<HTMLElement>(".tlc-sync"))
  const previous = scrollers.map((s) => s.scrollLeft)

  root.classList.add("tlc-exporting")
  // Switching to overflow:visible drops scrollLeft; zero it explicitly so the
  // ruler, gridlines and bars all share the same origin.
  for (const s of scrollers) s.scrollLeft = 0
  // Let layout settle before the capture reads geometry.
  await new Promise((r) => requestAnimationFrame(() => r(null)))

  return {
    element: root,
    restore: () => {
      root.classList.remove("tlc-exporting")
      scrollers.forEach((s, i) => {
        s.scrollLeft = previous[i]
      })
    },
  }
}

/** Row height — must match --tlc-row-h in timeline-chart.css. */
const ROW_H = 44

/** A dependency to draw, already resolved to visible rows by the caller. */
export type TimelineLink = {
  id: string
  source: string
  target: string
  /** Which end of each bar the arrow attaches to. */
  type: "FS" | "SS" | "FF" | "SF"
  label?: string
}

export type TimelineChartProps = {
  items: TimelineItem[]
  /** Header text above the label column. */
  labelHeader: string
  onItemClick?: (id: string) => void
  /** Provide to render expand/collapse toggles on rows with children. */
  onToggle?: (id: string) => void
  /** Bump to re-center the view on today. */
  scrollToToday?: number
  emptyText?: string
  /** Width of one week column — see WEEK_PX_BY_SCALE. */
  weekPx?: number
  /** Dependency arrows. Ids must refer to rows present in `items`. */
  links?: TimelineLink[]
}

export default function TimelineChart({
  items,
  labelHeader,
  onItemClick,
  onToggle,
  scrollToToday = 0,
  emptyText = "Không có dữ liệu trong khoảng thời gian này.",
  weekPx = DEFAULT_WEEK_PX,
  links,
}: TimelineChartProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  const { weeks, axisStart, trackWidth, spanMs } = useMemo(
    () => buildAxis(items, weekPx),
    [items, weekPx],
  )

  const toPx = (d: Date) => {
    const days = (d.getTime() - axisStart.getTime()) / DAY_MS
    return Math.max(
      0,
      Math.min(trackWidth, (days / (weeks.length * 7)) * trackWidth),
    )
  }

  /* Bar geometry keyed by row id, so dependency arrows and the bars themselves
     agree without measuring the DOM. y comes from the row index because row
     height is fixed (see --tlc-row-h). */
  const geometry = useMemo(() => {
    const totalDays = weeks.length * 7
    const px = (d: Date) => {
      const days = (d.getTime() - axisStart.getTime()) / DAY_MS
      return Math.max(0, Math.min(trackWidth, (days / totalDays) * trackWidth))
    }
    const map = new Map<string, { x1: number; x2: number; y: number }>()
    items.forEach((it, i) => {
      const x1 = px(it.start)
      map.set(it.id, {
        x1,
        x2: Math.max(x1 + 4, px(it.end)),
        y: i * ROW_H + ROW_H / 2,
      })
    })
    return map
  }, [items, axisStart, trackWidth, weeks.length])

  const arrows = useMemo(() => {
    if (!links?.length) return []
    /* Elbow depth scales with zoom: at "Thu nhỏ" (40px/week ≈ 5.7px/day) a fixed
       10px stub is wider than several days, so stubs from neighbouring bars merge
       into one blob. Scaling keeps them proportional to the bars they leave. */
    const ELBOW = Math.max(5, Math.round(weekPx / 8))
    const out: { id: string; d: string; head: string; label?: string }[] = []

    for (const link of links) {
      if (link.source === link.target) continue
      const s = geometry.get(link.source)
      const t = geometry.get(link.target)
      if (!s || !t) continue

      // FS/FF leave the source's finish; SS/SF leave its start.
      const sx = link.type === "SS" || link.type === "SF" ? s.x1 : s.x2
      // FS/SS arrive at the target's start; FF/SF at its finish.
      const tx = link.type === "FF" || link.type === "SF" ? t.x2 : t.x1

      let pts: [number, number][]
      if (tx > sx + ELBOW * 2) {
        // Room to route straight across: out, down/up, in.
        pts = [
          [sx, s.y],
          [sx + ELBOW, s.y],
          [sx + ELBOW, t.y],
          [tx, t.y],
        ]
      } else {
        // Target starts before the source ends — double back through the gap
        // between the two rows instead of drawing over the bars.
        const midY = s.y + (t.y > s.y ? ROW_H / 2 : -ROW_H / 2)
        pts = [
          [sx, s.y],
          [sx + ELBOW, s.y],
          [sx + ELBOW, midY],
          [tx - ELBOW, midY],
          [tx - ELBOW, t.y],
          [tx, t.y],
        ]
      }

      const d = pts
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`)
        .join(" ")
      // Arrowhead orientation follows the last segment's direction.
      const dir = pts[pts.length - 2][0] <= tx ? 1 : -1
      const head = [
        `${tx} ${t.y}`,
        `${tx - dir * 6} ${t.y - 4}`,
        `${tx - dir * 6} ${t.y + 4}`,
      ].join(" ")

      out.push({ id: link.id, d, head, label: link.label })
    }
    return out
  }, [links, geometry, weekPx])

  /* Scroll sync + needle. All rows scroll as one; the needle is a fixed pin and
     the tooltip reports whichever date sits under it. */
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !items.length) return

    const scrollers = Array.from(
      root.querySelectorAll<HTMLDivElement>(".tlc-sync"),
    )
    const needle = root.querySelector<HTMLDivElement>(".tlc-needle")
    const tip = root.querySelector<HTMLDivElement>(".tlc-date-tip")
    const sticky = root.querySelector<HTMLDivElement>(".tlc-sticky")
    const wkLines = root.querySelector<HTMLDivElement>(".tlc-wk-lines")
    const arrowLayer = root.querySelector<HTMLDivElement>(".tlc-arrow-layer")
    if (!scrollers.length || !needle || !tip || !sticky) return

    const axisMs = axisStart.getTime()
    let pinX = 0

    const dateAt = (x: number) => {
      const clamped = Math.max(0, Math.min(trackWidth, x))
      return fmtShortDate(new Date(axisMs + (clamped / trackWidth) * spanMs))
    }

    const todayX = () =>
      Math.max(
        0,
        Math.min(
          trackWidth,
          ((todayLocal().getTime() - axisMs) / spanMs) * trackWidth,
        ),
      )

    const refresh = () => {
      const sc = scrollers[0]
      const rootBox = root.getBoundingClientRect()
      const scBox = sc.getBoundingClientRect()
      const stickyBox = sticky.getBoundingClientRect()
      /* While today is on screen the needle marks today — that is what people read
         an orange line as. Only once today is scrolled out of view does it fall
         back to the demo's fixed reading pin at 32%, where the tooltip's job is to
         tell you which date you have scrolled to. */
      const todayViewX = todayX() - sc.scrollLeft
      pinX =
        todayViewX >= 0 && todayViewX <= sc.clientWidth
          ? todayViewX
          : Math.max(48, Math.min(scBox.width - 24, scBox.width * 0.32))
      needle.style.left = `${scBox.left - rootBox.left + pinX}px`
      tip.style.left = `${scBox.left - stickyBox.left + pinX}px`
      tip.textContent = dateAt(sc.scrollLeft + pinX)
      const shift = `translateX(-${sc.scrollLeft}px)`
      if (wkLines) wkLines.style.transform = shift
      // Arrows live in their own overlay, so they must follow the scroll too.
      if (arrowLayer) arrowLayer.style.transform = shift
    }

    const sync = (src: HTMLDivElement) => {
      for (const o of scrollers) {
        if (o !== src && o.scrollLeft !== src.scrollLeft)
          o.scrollLeft = src.scrollLeft
      }
      refresh()
    }

    const centerToday = () => {
      const sc = scrollers[0]
      if (!sc || sc.clientWidth < 1) return
      pinX = Math.max(48, Math.min(sc.clientWidth - 24, sc.clientWidth * 0.32))
      const left = Math.max(
        0,
        Math.min(trackWidth - sc.clientWidth, todayX() - pinX),
      )
      for (const s of scrollers) s.scrollLeft = left
      refresh()
    }

    const handlers = scrollers.map((sc) => {
      const h = () => sync(sc)
      sc.addEventListener("scroll", h, { passive: true })
      return [sc, h] as const
    })
    window.addEventListener("resize", refresh)

    /* Centering has to be retried: on first paint the scrollers often still have
       clientWidth 0, so a single call silently lands at scrollLeft 0. */
    centerToday()
    const raf1 = requestAnimationFrame(() => {
      centerToday()
      requestAnimationFrame(centerToday)
    })
    const t1 = setTimeout(centerToday, 80)
    const t2 = setTimeout(centerToday, 250)

    return () => {
      for (const [sc, h] of handlers) sc.removeEventListener("scroll", h)
      window.removeEventListener("resize", refresh)
      cancelAnimationFrame(raf1)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [items, axisStart, trackWidth, spanMs])

  // Toolbar "today" button
  useEffect(() => {
    if (!scrollToToday || !rootRef.current) return
    const scrollers = Array.from(
      rootRef.current.querySelectorAll<HTMLDivElement>(".tlc-sync"),
    )
    const sc = scrollers[0]
    if (!sc) return
    const pinX = Math.max(
      48,
      Math.min(sc.clientWidth - 24, sc.clientWidth * 0.32),
    )
    const todayX = Math.max(
      0,
      Math.min(
        trackWidth,
        ((todayLocal().getTime() - axisStart.getTime()) / spanMs) * trackWidth,
      ),
    )
    const left = Math.max(
      0,
      Math.min(trackWidth - sc.clientWidth, todayX - pinX),
    )
    for (const s of scrollers) s.scrollLeft = left
  }, [scrollToToday, axisStart, trackWidth, spanMs])

  if (!items.length) {
    return <p className="text-muted-foreground text-sm">{emptyText}</p>
  }

  return (
    <div
      ref={rootRef}
      className="tlc-root"
      style={{ "--tlc-wkpx": `${weekPx}px` } as React.CSSProperties}
    >
      <div className="tlc-wk-overlay">
        <div className="tlc-wk-lines" style={{ width: trackWidth }}>
          {weeks.map((w, i) => (
            <div
              key={`line-${w.getTime()}`}
              className="tlc-wk-line"
              style={{ left: i * weekPx }}
            />
          ))}
          <div
            className="tlc-wk-line"
            style={{ left: weeks.length * weekPx }}
          />
        </div>
      </div>

      {arrows.length > 0 ? (
        <div className="tlc-arrow-overlay">
          <div className="tlc-arrow-layer" style={{ width: trackWidth }}>
            <svg
              width={trackWidth}
              height={items.length * ROW_H}
              aria-hidden="true"
              focusable="false"
            >
              {arrows.map((a) => (
                <g key={a.id} className="tlc-arrow">
                  <path d={a.d} fill="none" />
                  <polygon points={a.head} />
                </g>
              ))}
            </svg>
          </div>
        </div>
      ) : null}

      <div className="tlc-needle">
        <div className="tlc-needle-line" />
      </div>

      <div className="tlc-sticky">
        <div className="tlc-date-tip" />
        <div className="tlc-row-flex">
          <div className="tlc-lbl-col">{labelHeader}</div>
          <div className="tlc-scroll tlc-sync">
            <div className="tlc-ruler" style={{ width: trackWidth }}>
              {weeks.map((w, i) => (
                <div
                  key={w.getTime()}
                  className="tlc-week"
                  style={{ left: i * weekPx, width: weekPx }}
                >
                  {fmtWeekRange(w)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {items.map((it) => {
        const left = toPx(it.start)
        const width = Math.max(4, toPx(it.end) - left)
        const progress = Math.max(0, Math.min(100, it.progress))
        const fill = Math.max(2, (width * progress) / 100)
        const days = dayCount(it.start, it.end)
        const range = `${fmtShortDate(it.start)} – ${fmtShortDate(it.end)}`
        const depth = it.depth ?? 0

        return (
          <div
            className={`tlc-body-row${it.hasChildren ? " tlc-row-parent" : ""}`}
            key={it.id}
          >
            <div
              className="tlc-lbl"
              title={it.tooltip ?? `${it.label} · ${range}`}
              style={depth ? { paddingLeft: 8 + depth * INDENT_PX } : undefined}
            >
              {it.hasChildren && onToggle ? (
                <button
                  type="button"
                  className="tlc-toggle"
                  aria-label={it.collapsed ? "Mở rộng" : "Thu gọn"}
                  aria-expanded={!it.collapsed}
                  onClick={() => onToggle(it.id)}
                >
                  {it.collapsed ? "▶" : "▼"}
                </button>
              ) : (
                <span className="tlc-toggle-spacer" />
              )}
              {/* Name and dates share one block so both lines keep the same left
                  edge — otherwise the toggle offsets only the name and the two
                  lines read as ragged/centred. */}
              <div className="tlc-lbl-text">
                {onItemClick ? (
                  <button
                    type="button"
                    className="tlc-name-title tlc-name"
                    onClick={() => onItemClick(it.id)}
                  >
                    {it.label}
                  </button>
                ) : (
                  <span className="tlc-name-title">{it.label}</span>
                )}
                <span className="tlc-name-dates">{range}</span>
              </div>
            </div>
            <div className="tlc-scroll tlc-sync">
              <div className="tlc-track-px" style={{ width: trackWidth }}>
                {/* The bar is clickable too, not just the label — that is where
                    people aim. Rendered as a button only when there is a handler
                    so read-only charts keep plain, non-focusable bars. */}
                <div
                  className={`tlc-bar-wrap${onItemClick ? " tlc-bar-clickable" : ""}`}
                  style={{ left, width }}
                  {...(onItemClick
                    ? {
                        role: "button",
                        tabIndex: 0,
                        "aria-label": it.label,
                        onClick: () => onItemClick(it.id),
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onItemClick(it.id)
                          }
                        },
                      }
                    : {})}
                >
                  <div
                    className="tlc-bar-bg"
                    style={{
                      background: `${it.color}28`,
                      borderColor: `${it.color}55`,
                    }}
                  />
                  <div
                    className="tlc-bar"
                    style={{
                      width: fill,
                      background: `linear-gradient(90deg,${it.color},${it.color}bb)`,
                    }}
                  />
                  {/* Text appears only when the bar is wide enough to hold it.
                      Thresholds ported from the demo; the name needs the most room
                      so it is the first thing dropped. */}
                  {width > 28 ? (
                    <div
                      className={`tlc-bar-text${
                        width > 150 ? "" : " tlc-bar-text-compact"
                      }`}
                    >
                      {width > 150 ? (
                        <span
                          className="tlc-bar-label"
                          title={it.barText ?? it.label}
                        >
                          {it.barText ?? it.label}
                        </span>
                      ) : null}
                      <span className="tlc-bar-days">{days}ng</span>
                      {width > 52 ? (
                        <span className="tlc-pct">{progress}%</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

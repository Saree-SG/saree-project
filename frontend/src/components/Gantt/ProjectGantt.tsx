/**
 * ProjectGantt — Custom SVG Gantt chart component.
 *
 * Layout:
 *   Left  (240 px fixed)  : task name list with level indent + status colour
 *   Right (scrollable)    : SVG with date-column header, grid, bars, arrows
 *
 * Features:
 *   - Critical-path bars rendered in red
 *   - FS dependency arrows drawn between bars
 *   - Right-edge drag to resize a bar → updates task end_time
 *   - Today marker (blue vertical line)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import useCustomToast from "@/hooks/useCustomToast"
import {
  fetchProjectGantt,
  type GanttDependency,
  type GanttTask,
  removeDependency,
  updateTaskTimeline,
} from "@/modules/gantt/ganttApi"

// ─── Constants ────────────────────────────────────────────────────────────────

const LEFT_PANEL_W = 240
const ROW_H = 40
const ROW_PAD = 6
const BAR_H = ROW_H - ROW_PAD * 2
const HEADER_H = 48
const PX_PER_DAY = 28        // pixels per calendar day
const INDENT_PX = 14         // indent per tree level

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
}

function fmtWeekLabel(d: Date): string {
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "short" })
}

function statusColor(task: GanttTask): string {
  if (task.is_on_critical_path) return "#ef4444"   // red-500
  if (task.status === "done") return "#22c55e"       // green-500
  if (task.status === "review") return "#f59e0b"     // amber-500
  if (task.status === "in_progress") return "#3b82f6" // blue-500
  return "#94a3b8"                                    // slate-400 (todo)
}

function statusBg(task: GanttTask): string {
  if (task.is_on_critical_path) return "#fef2f2"
  if (task.status === "done") return "#f0fdf4"
  if (task.status === "in_progress") return "#eff6ff"
  return "#f8fafc"
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskRow = {
  task: GanttTask
  rowIndex: number
  barX: number
  barW: number
  barY: number
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = { projectId: string }

export function ProjectGantt({ projectId }: Props) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const ganttQuery = useQuery({
    queryKey: ["gantt", projectId],
    queryFn: () => fetchProjectGantt(projectId),
    staleTime: 30_000,
  })

  const updateMutation = useMutation({
    mutationFn: ({
      taskId,
      start,
      end,
    }: {
      taskId: string
      start: string
      end: string
    }) => updateTaskTimeline(taskId, start, end),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gantt", projectId] })
      void queryClient.invalidateQueries({
        queryKey: ["project-dashboard", "tasks", projectId],
      })
      showSuccessToast("Deadline đã được cập nhật")
    },
    onError: () => showErrorToast("Không thể cập nhật deadline"),
  })

  const removeMutation = useMutation({
    mutationFn: ({ blockingId, depId }: { blockingId: string; depId: string }) =>
      removeDependency(blockingId, depId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gantt", projectId] })
      showSuccessToast("Đã xoá liên kết phụ thuộc")
    },
    onError: () => showErrorToast("Không thể xoá liên kết"),
  })

  // ─── Drag state ─────────────────────────────────────────────────────────────

  const dragRef = useRef<{
    taskId: string
    origEndPx: number
    origEndDate: Date
    startX: number
  } | null>(null)
  const [dragEndPx, setDragEndPx] = useState<{ taskId: string; px: number } | null>(null)

  // ─── Derived layout ─────────────────────────────────────────────────────────

  const tasks = ganttQuery.data?.tasks ?? []
  const deps = ganttQuery.data?.dependencies ?? []

  const { projectStart, projectEnd, totalDays, taskRows } = (() => {
    if (tasks.length === 0) {
      const now = new Date()
      return {
        projectStart: now,
        projectEnd: addDays(now, 30),
        totalDays: 30,
        taskRows: [] as TaskRow[],
      }
    }

    const starts = tasks.map((t) => new Date(t.start_time))
    const ends = tasks.map((t) => new Date(t.end_time))
    const pStart = addDays(new Date(Math.min(...starts.map((d) => d.getTime()))), -2)
    const pEnd = addDays(new Date(Math.max(...ends.map((d) => d.getTime()))), 2)
    const total = Math.max(1, daysBetween(pStart, pEnd))

    const rows: TaskRow[] = tasks.map((task, i) => {
      const taskStart = new Date(task.start_time)
      const taskEnd = new Date(task.end_time)
      const bx = daysBetween(pStart, taskStart) * PX_PER_DAY
      const bw = Math.max(PX_PER_DAY, daysBetween(taskStart, taskEnd) * PX_PER_DAY)
      const by = i * ROW_H + ROW_PAD
      return { task, rowIndex: i, barX: bx, barW: bw, barY: by }
    })

    return { projectStart: pStart, projectEnd: pEnd, totalDays: total, taskRows: rows }
  })()

  const svgW = totalDays * PX_PER_DAY
  const svgH = tasks.length * ROW_H + HEADER_H
  const todayX = daysBetween(projectStart, new Date()) * PX_PER_DAY

  // ─── Week column headers ─────────────────────────────────────────────────────

  const weekHeaders: { x: number; label: string }[] = []
  let cur = new Date(projectStart)
  while (cur < projectEnd) {
    const x = daysBetween(projectStart, cur) * PX_PER_DAY
    weekHeaders.push({ x, label: fmtWeekLabel(cur) })
    cur = addDays(cur, 7)
  }

  // ─── Row index lookup for arrow drawing ─────────────────────────────────────

  const rowByTaskId = new Map<string, TaskRow>(taskRows.map((r) => [r.task.id, r]))

  // ─── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.PointerEvent<SVGRectElement>, row: TaskRow) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = {
        taskId: row.task.id,
        origEndPx: row.barX + row.barW,
        origEndDate: new Date(row.task.end_time),
        startX: e.clientX,
      }
    },
    [],
  )

  const handleDragMove = useCallback((e: React.PointerEvent<SVGRectElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const newEndPx = Math.max(
      dragRef.current.origEndPx - 2 * PX_PER_DAY,
      dragRef.current.origEndPx + dx,
    )
    setDragEndPx({ taskId: dragRef.current.taskId, px: newEndPx })
  }, [])

  const handleDragEnd = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const addedDays = Math.round(dx / PX_PER_DAY)
      if (addedDays !== 0) {
        const newEnd = addDays(dragRef.current.origEndDate, addedDays)
        const row = taskRows.find((r) => r.task.id === dragRef.current!.taskId)
        if (row) {
          updateMutation.mutate({
            taskId: dragRef.current.taskId,
            start: row.task.start_time,
            end: newEnd.toISOString(),
          })
        }
      }
      dragRef.current = null
      setDragEndPx(null)
    },
    [taskRows, updateMutation],
  )

  // ─── Keyboard dismiss drag ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragRef.current = null
        setDragEndPx(null)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // ─── Dependency arrows ───────────────────────────────────────────────────────

  function buildArrowPath(dep: GanttDependency): string | null {
    if (dep.dependency_type !== "FS") return null
    const fromRow = rowByTaskId.get(dep.blocking_task_id)
    const toRow = rowByTaskId.get(dep.dependent_task_id)
    if (!fromRow || !toRow) return null

    const x1 = fromRow.barX + fromRow.barW          // right edge of blocking bar
    const y1 = HEADER_H + fromRow.barY + BAR_H / 2  // mid-Y of blocking bar
    const x2 = toRow.barX                            // left edge of dependent bar
    const y2 = HEADER_H + toRow.barY + BAR_H / 2    // mid-Y of dependent bar

    const cpX = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${cpX} ${y1} ${cpX} ${y2} ${x2} ${y2}`
  }

  // ─── Loading / empty ─────────────────────────────────────────────────────────

  if (ganttQuery.isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Đang tải Gantt…
      </div>
    )
  }
  if (tasks.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Chưa có công việc nào để hiển thị Gantt.
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-b px-4 py-2 text-xs font-medium">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-red-500" />
          Đường găng (Critical)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-blue-500" />
          Đang thực hiện
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-green-500" />
          Hoàn thành
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded bg-slate-400" />
          Chưa bắt đầu
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Kéo cạnh phải của thanh để điều chỉnh deadline
        </span>
      </div>

      <div className="flex overflow-x-auto">
        {/* ── Left panel: task names ── */}
        <div
          className="shrink-0 border-r bg-slate-50"
          style={{ width: LEFT_PANEL_W, minWidth: LEFT_PANEL_W }}
        >
          {/* Header spacer */}
          <div
            className="border-b bg-slate-100 px-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-end pb-1"
            style={{ height: HEADER_H }}
          >
            Công việc
          </div>

          {/* Task name rows */}
          {taskRows.map(({ task }) => (
            <div
              key={task.id}
              className="flex items-center gap-1.5 border-b px-2 text-xs"
              style={{
                height: ROW_H,
                paddingLeft: 8 + task.level * INDENT_PX,
                background: statusBg(task),
              }}
            >
              {/* Critical path indicator */}
              {task.is_on_critical_path && (
                <span
                  className="shrink-0 rounded-full"
                  style={{ width: 6, height: 6, background: "#ef4444" }}
                  title="Đường găng"
                />
              )}
              <span
                className="truncate font-medium"
                style={{ color: task.is_on_critical_path ? "#dc2626" : undefined }}
                title={task.name}
              >
                {task.name}
              </span>
            </div>
          ))}
        </div>

        {/* ── Right panel: SVG Gantt ── */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <svg
            width={svgW}
            height={svgH}
            className="block"
            style={{ minWidth: svgW }}
          >
            {/* ── Date column header ── */}
            <rect x={0} y={0} width={svgW} height={HEADER_H} fill="#f1f5f9" />
            {weekHeaders.map(({ x, label }) => (
              <g key={x}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={HEADER_H}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />
                <text
                  x={x + 4}
                  y={HEADER_H - 10}
                  fontSize={10}
                  fill="#64748b"
                  fontWeight={600}
                >
                  {label}
                </text>
              </g>
            ))}
            <line
              x1={0}
              y1={HEADER_H}
              x2={svgW}
              y2={HEADER_H}
              stroke="#e2e8f0"
              strokeWidth={1}
            />

            {/* ── Row grid lines ── */}
            {taskRows.map(({ rowIndex }) => (
              <line
                key={rowIndex}
                x1={0}
                y1={HEADER_H + rowIndex * ROW_H}
                x2={svgW}
                y2={HEADER_H + rowIndex * ROW_H}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
            ))}

            {/* ── Today marker ── */}
            {todayX >= 0 && todayX <= svgW && (
              <g>
                <line
                  x1={todayX}
                  y1={0}
                  x2={todayX}
                  y2={svgH}
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <text x={todayX + 3} y={14} fontSize={9} fill="#3b82f6" fontWeight={700}>
                  Hôm nay
                </text>
              </g>
            )}

            {/* ── Dependency arrows ── */}
            {deps.map((dep) => {
              const path = buildArrowPath(dep)
              if (!path) return null
              const isCritical =
                rowByTaskId.get(dep.blocking_task_id)?.task.is_on_critical_path &&
                rowByTaskId.get(dep.dependent_task_id)?.task.is_on_critical_path
              return (
                <g key={dep.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={isCritical ? "#ef4444" : "#94a3b8"}
                    strokeWidth={isCritical ? 2 : 1.5}
                    strokeDasharray={isCritical ? undefined : "4 3"}
                    markerEnd={
                      isCritical ? "url(#arrowhead-red)" : "url(#arrowhead-gray)"
                    }
                  />
                  {/* Invisible wider path for easier click-to-remove */}
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    className="cursor-pointer"
                    onClick={() =>
                      removeMutation.mutate({
                        blockingId: dep.blocking_task_id,
                        depId: dep.id,
                      })
                    }
                  >
                    <title>Click để xoá liên kết</title>
                  </path>
                </g>
              )
            })}

            {/* ── Arrow marker definitions ── */}
            <defs>
              <marker
                id="arrowhead-red"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#ef4444" />
              </marker>
              <marker
                id="arrowhead-gray"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
              </marker>
            </defs>

            {/* ── Task bars ── */}
            {taskRows.map((row) => {
              const { task, barX, barY, barW } = row
              const color = statusColor(task)

              // Drag preview overrides barW
              const displayW =
                dragEndPx?.taskId === task.id
                  ? Math.max(PX_PER_DAY, dragEndPx.px - barX)
                  : barW

              const svgBarY = HEADER_H + barY

              return (
                <g key={task.id}>
                  {/* Main bar background */}
                  <rect
                    x={barX}
                    y={svgBarY}
                    width={displayW}
                    height={BAR_H}
                    rx={4}
                    fill={color}
                    opacity={0.18}
                  />

                  {/* Progress fill */}
                  <rect
                    x={barX}
                    y={svgBarY}
                    width={(displayW * Math.min(100, task.reported_progress_total)) / 100}
                    height={BAR_H}
                    rx={4}
                    fill={color}
                    opacity={0.7}
                  />

                  {/* Bar border */}
                  <rect
                    x={barX}
                    y={svgBarY}
                    width={displayW}
                    height={BAR_H}
                    rx={4}
                    fill="none"
                    stroke={color}
                    strokeWidth={task.is_on_critical_path ? 2 : 1}
                  />

                  {/* Task name inside bar */}
                  <text
                    x={barX + 6}
                    y={svgBarY + BAR_H / 2 + 4}
                    fontSize={10}
                    fontWeight={600}
                    fill={color}
                    style={{ userSelect: "none", pointerEvents: "none" }}
                  >
                    {task.name.length > 22 ? `${task.name.slice(0, 22)}…` : task.name}
                  </text>

                  {/* Right-edge drag handle */}
                  <rect
                    x={barX + displayW - 6}
                    y={svgBarY}
                    width={10}
                    height={BAR_H}
                    fill="transparent"
                    className="cursor-ew-resize"
                    onPointerDown={(e) => handleDragStart(e, row)}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                  />

                  {/* Drag handle visual indicator */}
                  <rect
                    x={barX + displayW - 3}
                    y={svgBarY + 4}
                    width={3}
                    height={BAR_H - 8}
                    rx={1}
                    fill={color}
                    opacity={0.5}
                    style={{ pointerEvents: "none" }}
                  />

                  {/* Deadline label on the right of bar */}
                  <text
                    x={barX + displayW + 4}
                    y={svgBarY + BAR_H / 2 + 4}
                    fontSize={9}
                    fill="#64748b"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {fmtDate(
                      dragEndPx?.taskId === task.id
                        ? addDays(
                            new Date(task.start_time),
                            Math.round((dragEndPx.px - barX) / PX_PER_DAY),
                          )
                        : new Date(task.end_time),
                    )}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}

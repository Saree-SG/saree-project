import { Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { Tree, TreeNode } from "react-organizational-chart"

import { cn } from "@/lib/utils"
import type { GanttTask } from "@/modules/gantt/ganttApi"

/**
 * Task hierarchy rendered as a top-down org chart — the same look as the HR
 * "Sơ đồ tổ chức" (see Admin/Organization/OrgChart). Each task is a centered
 * card, branches join with elbow connector lines, and every node can be
 * expanded / collapsed independently.
 *
 * Built from a flat list of project tasks (the Gantt endpoint shape, which
 * already carries `parent_id` / `level`), so it renders the full WBS depth.
 */

const STATUS_LABEL: Record<string, string> = {
  todo: "Chờ làm",
  in_progress: "Đang làm",
  review: "Chờ duyệt",
  done: "Hoàn thành",
  blocked: "Đang bị chặn",
  cancelled: "Đã huỷ",
  overdue_local: "Quá hạn",
  overdue_critical: "Quá hạn nặng",
  due_soon: "Sắp đến hạn",
}

// Names for each nesting level (matches the backend WBS terminology).
const LEVEL_LABEL = ["Hạng mục", "Công việc", "Đầu việc", "Bước", "Chi tiết"]

function statusBadgeClass(task: GanttTask): string {
  const s = task.computed_status ?? task.status
  if (s === "done") return "bg-green-100 text-green-700"
  if (s === "overdue_critical" || s === "overdue_local")
    return "bg-red-100 text-red-700"
  if (s === "due_soon") return "bg-amber-100 text-amber-700"
  if (s === "in_progress") return "bg-blue-100 text-blue-700"
  if (s === "blocked") return "bg-orange-100 text-orange-700"
  return "bg-slate-100 text-slate-600"
}

function statusLabel(task: GanttTask): string {
  const s = task.computed_status ?? task.status
  return STATUS_LABEL[s] ?? s
}

function progressBarClass(progress: number): string {
  if (progress >= 100) return "bg-green-500"
  if (progress >= 60) return "bg-blue-500"
  if (progress >= 30) return "bg-amber-400"
  return "bg-slate-300"
}

type TaskTreeProps = {
  /** Every task of the project (Gantt shape). */
  tasks: GanttTask[]
  /** Subtree root — its descendants are rendered (the root itself is not). */
  rootId: string
  /** Task currently being viewed; highlighted wherever it appears. */
  currentTaskId?: string
  /**
   * Levels (relative to the first rendered node) expanded on first render.
   * `Infinity` expands everything. Defaults to fully expanded.
   */
  initialExpandDepth?: number
  /**
   * When true, the `rootId` task itself is rendered as the top node (with its
   * descendants nested beneath). When false (default), only its descendants.
   */
  showRoot?: boolean
}

export function TaskTree({
  tasks,
  rootId,
  currentTaskId,
  initialExpandDepth = Number.POSITIVE_INFINITY,
  showRoot = false,
}: TaskTreeProps) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string, GanttTask[]>()
    for (const task of tasks) {
      const key = task.parent_id ?? "__root__"
      const bucket = map.get(key)
      if (bucket) bucket.push(task)
      else map.set(key, [task])
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => {
        const ta = new Date(a.start_time).getTime()
        const tb = new Date(b.start_time).getTime()
        if (ta !== tb) return ta - tb
        return a.name.localeCompare(b.name)
      })
    }
    return map
  }, [tasks])

  const rootTask = useMemo(
    () => tasks.find((t) => t.id === rootId),
    [tasks, rootId],
  )

  const roots =
    showRoot && rootTask ? [rootTask] : childrenByParent.get(rootId) ?? []

  if (roots.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Chưa có công việc con nào.</p>
    )
  }

  return (
    <div className="w-full overflow-auto rounded-md border bg-muted/20 p-6">
      <div className="inline-block min-w-full space-y-8">
        {roots.map((root) => (
          <Tree
            key={root.id}
            lineWidth="2px"
            lineColor="#cbd5e1"
            lineBorderRadius="8px"
            label={
              <TaskCard
                node={root}
                childCount={(childrenByParent.get(root.id) ?? []).length}
                currentTaskId={currentTaskId}
                expanded={undefined}
                onToggle={undefined}
              />
            }
          >
            <TaskBranchChildren
              parent={root}
              depth={0}
              childrenByParent={childrenByParent}
              currentTaskId={currentTaskId}
              initialExpandDepth={initialExpandDepth}
            />
          </Tree>
        ))}
      </div>
    </div>
  )
}

type BranchProps = {
  parent: GanttTask
  depth: number
  childrenByParent: Map<string, GanttTask[]>
  currentTaskId?: string
  initialExpandDepth: number
}

/**
 * Renders the children TreeNodes of `parent`. Split out so the top-level
 * <Tree> (whose root is always shown) and nested <TreeNode>s share the same
 * recursion. The expand/collapse toggle of the *parent* lives here via
 * TaskBranch so each subtree can be folded independently.
 */
function TaskBranchChildren({
  parent,
  depth,
  childrenByParent,
  currentTaskId,
  initialExpandDepth,
}: BranchProps) {
  const children = childrenByParent.get(parent.id) ?? []
  return (
    <>
      {children.map((child) => (
        <TaskBranch
          key={child.id}
          node={child}
          depth={depth + 1}
          childrenByParent={childrenByParent}
          currentTaskId={currentTaskId}
          initialExpandDepth={initialExpandDepth}
        />
      ))}
    </>
  )
}

type NodeProps = {
  node: GanttTask
  depth: number
  childrenByParent: Map<string, GanttTask[]>
  currentTaskId?: string
  initialExpandDepth: number
}

function TaskBranch({
  node,
  depth,
  childrenByParent,
  currentTaskId,
  initialExpandDepth,
}: NodeProps) {
  const children = childrenByParent.get(node.id) ?? []
  const hasChildren = children.length > 0
  const [expanded, setExpanded] = useState(depth < initialExpandDepth)

  return (
    <TreeNode
      label={
        <TaskCard
          node={node}
          childCount={children.length}
          currentTaskId={currentTaskId}
          expanded={hasChildren ? expanded : undefined}
          onToggle={hasChildren ? () => setExpanded((v) => !v) : undefined}
        />
      }
    >
      {hasChildren && expanded
        ? children.map((child) => (
            <TaskBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              currentTaskId={currentTaskId}
              initialExpandDepth={initialExpandDepth}
            />
          ))
        : null}
    </TreeNode>
  )
}

type CardProps = {
  node: GanttTask
  childCount: number
  currentTaskId?: string
  /** undefined → no children (no toggle button). */
  expanded?: boolean
  onToggle?: () => void
}

/** A single task card — mirrors the org-chart node styling. */
function TaskCard({
  node,
  childCount,
  currentTaskId,
  expanded,
  onToggle,
}: CardProps) {
  const isCurrent = node.id === currentTaskId
  const progress = Math.round(node.reported_progress_total ?? 0)
  const levelLabel = LEVEL_LABEL[node.level] ?? `Tầng ${node.level + 1}`

  return (
    <div
      className={cn(
        "inline-flex w-60 flex-col gap-2 rounded-xl border bg-card p-3 text-left shadow-sm",
        isCurrent && "border-2 border-primary bg-primary/10 ring-2 ring-primary/20",
      )}
    >
      <div className="flex items-start gap-2">
        {onToggle ? (
          <button
            type="button"
            aria-label={expanded ? "Thu gọn" : "Mở rộng"}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs text-muted-foreground hover:bg-muted"
            onClick={onToggle}
          >
            {expanded ? "−" : "+"}
          </button>
        ) : null}
        <Link
          to="/tasks/$taskId"
          params={{ taskId: node.id }}
          className="line-clamp-2 flex-1 text-sm font-semibold hover:underline"
        >
          {node.name}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {levelLabel}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            statusBadgeClass(node),
          )}
        >
          {statusLabel(node)}
        </span>
        {isCurrent ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            Đang xem
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progressBarClass(progress),
            )}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-bold text-slate-700">
          {progress}%
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
        <span className="truncate">👤 {node.assignee_name ?? "Chưa giao"}</span>
        {childCount > 0 ? <span>📂 {childCount}</span> : null}
      </div>
    </div>
  )
}

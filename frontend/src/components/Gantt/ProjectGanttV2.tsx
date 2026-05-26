import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useRef, useState } from "react"

import useCustomToast from "@/hooks/useCustomToast"
import {
  addDependency,
  fetchProjectGantt,
  removeDependency,
  updateTaskTimeline,
} from "@/modules/gantt/ganttApi"
import { handleError } from "@/utils"

import GanttToolbar from "./GanttToolbar"
import GanttView, { type GanttViewHandle } from "./GanttView"
import TaskQuickEdit from "./TaskQuickEdit"
import { toGanttLink, toGanttRow } from "./transformers"
import type {
  GanttFilter,
  GanttGroupBy,
  GanttRow,
  GanttScale,
} from "./types"

type Props = { projectId: string }

const DEBOUNCE_MS = 800

export default function ProjectGanttV2({ projectId }: Props) {
  const qc = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const queryKey = ["gantt", "project", projectId]

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchProjectGantt(projectId),
  })

  const rows: GanttRow[] = useMemo(
    () => (data?.tasks ?? []).map(toGanttRow),
    [data?.tasks],
  )
  const links = useMemo(
    () => (data?.dependencies ?? []).map(toGanttLink),
    [data?.dependencies],
  )

  const [scale, setScale] = useState<GanttScale>("day")
  const [groupBy, setGroupBy] = useState<GanttGroupBy>("none")
  const [filter, setFilter] = useState<GanttFilter>({})
  const [scrollToToday, setScrollToToday] = useState(0)
  const [editingRow, setEditingRow] = useState<GanttRow | null>(null)
  const ganttRef = useRef<GanttViewHandle>(null)

  // Debounced drag PATCH
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )
  const pendingRef = useRef<
    Map<string, { start?: Date; end?: Date }>
  >(new Map())

  const updateMutation = useMutation({
    mutationFn: (p: { taskId: string; start: string; end: string }) =>
      updateTaskTimeline(p.taskId, p.start, p.end),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: handleError.bind(showErrorToast),
  })

  const addDepMutation = useMutation({
    mutationFn: (p: { source: string; target: string }) =>
      addDependency(p.source, p.target),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: handleError.bind(showErrorToast),
  })

  const removeDepMutation = useMutation({
    mutationFn: (p: { blockingId: string; linkId: string }) =>
      removeDependency(p.blockingId, p.linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: handleError.bind(showErrorToast),
  })

  const handleTaskUpdate = (
    taskId: string,
    patch: { start?: Date; end?: Date; progress?: number },
  ) => {
    // accumulate latest patch per task
    const existing = pendingRef.current.get(taskId) ?? {}
    pendingRef.current.set(taskId, { ...existing, ...patch })

    // reset timer
    const prev = debounceRef.current.get(taskId)
    if (prev) clearTimeout(prev)
    const t = setTimeout(() => {
      const merged = pendingRef.current.get(taskId)
      pendingRef.current.delete(taskId)
      debounceRef.current.delete(taskId)
      if (!merged) return

      const row = rows.find((r) => r.id === taskId)
      const start = merged.start ?? row?.start
      const end = merged.end ?? row?.end
      if (!start || !end) return
      updateMutation.mutate({
        taskId,
        start: start.toISOString(),
        end: end.toISOString(),
      })
    }, DEBOUNCE_MS)
    debounceRef.current.set(taskId, t)
  }

  const handleTaskClick = (taskId: string) => {
    const row = rows.find((r) => r.id === taskId)
    if (row) setEditingRow(row)
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border text-muted-foreground">
        Đang tải Gantt...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Không tải được Gantt.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <GanttToolbar
        rows={rows}
        scale={scale}
        onScaleChange={setScale}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        filter={filter}
        onFilterChange={setFilter}
        onScrollToToday={() => setScrollToToday((n) => n + 1)}
        enableDepartmentGroup
        getExportElement={() => ganttRef.current?.getElement() ?? null}
      />

      <GanttView
        ref={ganttRef}
        rows={rows}
        links={links}
        scale={scale}
        groupBy={groupBy}
        filter={filter}
        scrollToToday={scrollToToday}
        onTaskUpdate={handleTaskUpdate}
        onTaskClick={handleTaskClick}
        onLinkAdd={(source, target) =>
          addDepMutation.mutate({ source, target })
        }
        onLinkRemove={(linkId) => {
          const link = links.find((l) => l.id === linkId)
          if (link) {
            removeDepMutation.mutate({
              blockingId: link.source,
              linkId,
            })
          }
        }}
      />

      <TaskQuickEdit
        open={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
        row={editingRow}
        invalidateKeys={[queryKey, ["tasks"]]}
      />
    </div>
  )
}

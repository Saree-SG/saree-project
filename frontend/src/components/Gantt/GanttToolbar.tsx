import { Calendar, Download, Filter, Target } from "lucide-react"
import { useState } from "react"

import useCustomToast from "@/hooks/useCustomToast"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type {
  GanttFilter,
  GanttGroupBy,
  GanttRow,
  GanttRowStatus,
  GanttScale,
} from "./types"

const STATUS_OPTIONS: { value: GanttRowStatus; label: string }[] = [
  { value: "todo", label: "Chưa làm" },
  { value: "in_progress", label: "Đang làm" },
  { value: "review", label: "Review" },
  { value: "done", label: "Hoàn thành" },
  { value: "blocked", label: "Bị chặn" },
  { value: "cancelled", label: "Đã huỷ" },
]

type Props = {
  rows: GanttRow[]
  scale: GanttScale
  onScaleChange: (s: GanttScale) => void
  groupBy: GanttGroupBy
  onGroupByChange: (g: GanttGroupBy) => void
  filter: GanttFilter
  onFilterChange: (f: GanttFilter) => void
  onScrollToToday: () => void
  /** Show "project" option in groupBy */
  enableProjectGroup?: boolean
  /** Show "department" option */
  enableDepartmentGroup?: boolean
  /** Provide element to export as PNG (Gantt container) */
  getExportElement?: () => HTMLElement | null
}

export default function GanttToolbar({
  rows,
  scale,
  onScaleChange,
  groupBy,
  onGroupByChange,
  filter,
  onFilterChange,
  onScrollToToday,
  enableProjectGroup,
  enableDepartmentGroup,
  getExportElement,
}: Props) {
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [exporting, setExporting] = useState(false)

  const handleExportPng = async () => {
    const el = getExportElement?.()
    if (!el) return
    setExporting(true)
    try {
      const { toPng } = await import("html-to-image")
      const dataUrl = await toPng(el, {
        cacheBust: true,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      })
      const link = document.createElement("a")
      link.download = `gantt-${Date.now()}.png`
      link.href = dataUrl
      link.click()
      showSuccessToast("Đã tải Gantt PNG")
    } catch (err) {
      showErrorToast("Xuất PNG thất bại")
      console.error(err)
    } finally {
      setExporting(false)
    }
  }
  const assignees = Array.from(
    rows.reduce((m, r) => {
      const id = r.assignee_id || r.assignee_name
      if (id) m.set(id, r.assignee_name || id)
      return m
    }, new Map<string, string>()),
  )

  const toggleStatus = (s: GanttRowStatus) => {
    const cur = new Set(filter.status ?? [])
    if (cur.has(s)) cur.delete(s)
    else cur.add(s)
    onFilterChange({ ...filter, status: [...cur] })
  }

  const toggleAssignee = (id: string) => {
    const cur = new Set(filter.assigneeIds ?? [])
    if (cur.has(id)) cur.delete(id)
    else cur.add(id)
    onFilterChange({ ...filter, assigneeIds: [...cur] })
  }

  const statusCount = (filter.status ?? []).length
  const assigneeCount = (filter.assigneeIds ?? []).length
  const filterActive =
    statusCount > 0 || assigneeCount > 0 || filter.criticalOnly

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={scale} onValueChange={(v) => onScaleChange(v as GanttScale)}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="day">Ngày</SelectItem>
          <SelectItem value="week">Tuần</SelectItem>
          <SelectItem value="month">Tháng</SelectItem>
        </SelectContent>
      </Select>

      <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as GanttGroupBy)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Nhóm theo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Không nhóm</SelectItem>
          <SelectItem value="assignee">Theo người</SelectItem>
          <SelectItem value="status">Theo trạng thái</SelectItem>
          {enableDepartmentGroup ? (
            <SelectItem value="department">Theo phòng ban</SelectItem>
          ) : null}
          {enableProjectGroup ? (
            <SelectItem value="project">Theo dự án</SelectItem>
          ) : null}
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={filterActive ? "default" : "outline"}
            size="sm"
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            Lọc
            {filterActive ? (
              <span className="ml-1 rounded-sm bg-background/30 px-1 text-xs">
                {statusCount + assigneeCount + (filter.criticalOnly ? 1 : 0)}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Trạng thái</DropdownMenuLabel>
          {STATUS_OPTIONS.map((s) => (
            <DropdownMenuCheckboxItem
              key={s.value}
              checked={(filter.status ?? []).includes(s.value)}
              onCheckedChange={() => toggleStatus(s.value)}
            >
              {s.label}
            </DropdownMenuCheckboxItem>
          ))}
          {assignees.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Người phụ trách</DropdownMenuLabel>
              <div className="max-h-48 overflow-auto">
                {assignees.map(([id, name]) => (
                  <DropdownMenuCheckboxItem
                    key={id}
                    checked={(filter.assigneeIds ?? []).includes(id)}
                    onCheckedChange={() => toggleAssignee(id)}
                  >
                    {name}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
            <Checkbox
              checked={Boolean(filter.criticalOnly)}
              onCheckedChange={(v) =>
                onFilterChange({ ...filter, criticalOnly: Boolean(v) })
              }
            />
            <Target className="h-3 w-3 text-rose-600" />
            Chỉ critical path
          </label>
          {filterActive ? (
            <>
              <DropdownMenuSeparator />
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => onFilterChange({})}
              >
                Xoá tất cả lọc
              </Button>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="outline" size="sm" onClick={onScrollToToday}>
        <Calendar className="mr-1 h-4 w-4" />
        Hôm nay
      </Button>

      {getExportElement ? (
        <Button
          variant="outline"
          size="sm"
          disabled={exporting}
          onClick={handleExportPng}
        >
          <Download className="mr-1 h-4 w-4" />
          {exporting ? "Đang xuất..." : "PNG"}
        </Button>
      ) : null}
    </div>
  )
}

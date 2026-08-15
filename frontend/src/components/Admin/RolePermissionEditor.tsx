/**
 * RolePermissionEditor
 *
 * A grouped, searchable, tooltipped permission checkbox matrix.
 * Used in both the "Add Role" form and the "Edit role permissions" dialog.
 */
import { Info } from "lucide-react"
import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { PermissionCatalogItem } from "@/modules/rbac/rbacApi"

// ---------------------------------------------------------------------------
// Module metadata — display order + Vietnamese label
// ---------------------------------------------------------------------------

const MODULE_META: Record<string, { label: string; order: number }> = {
  quotation: { label: "Quy Trình Báo Giá", order: 0 },
  project: { label: "Dự Án", order: 1 },
  task: { label: "Công Việc & Nhiệm Vụ", order: 2 },
  report: { label: "Báo Cáo & Thống Kê", order: 3 },
  user: { label: "Quản Lý Người Dùng", order: 4 },
  audit: { label: "Nhật Ký Hệ Thống", order: 5 },
  company: { label: "Công Ty", order: 6 },
}

const ACTION_VI: Record<string, string> = {
  read: "Xem",
  create: "Tạo",
  update: "Chỉnh sửa",
  delete: "Xóa",
  approve: "Phê duyệt",
}

const SCOPE_VI: Record<string, string> = {
  global: "Toàn công ty",
  assigned: "Chỉ hồ sơ/dự án được phân công",
  own: "Của bản thân",
  team: "Nhóm / Phòng ban",
  project: "Trong phạm vi dự án",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface GroupedModule {
  module: string
  label: string
  order: number
  rows: PermissionCatalogItem[]
}

function buildGroups(catalog: PermissionCatalogItem[]): GroupedModule[] {
  const map = new Map<string, PermissionCatalogItem[]>()
  for (const item of catalog) {
    const key = item.module || "other"
    const arr = map.get(key) ?? []
    arr.push(item)
    map.set(key, arr)
  }
  return Array.from(map.entries())
    .map(([module, rows]) => ({
      module,
      label: MODULE_META[module]?.label ?? module,
      order: MODULE_META[module]?.order ?? 99,
      rows: rows.slice().sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.order - b.order)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PermissionInfoTooltip({ item }: { item: PermissionCatalogItem }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="ml-1 shrink-0 rounded-full text-muted-foreground hover:text-foreground focus:outline-none"
          aria-label={`Thông tin quyền ${item.code}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64 space-y-1.5 p-3 text-xs">
        <p className="font-mono font-semibold text-foreground">{item.code}</p>
        <div className="space-y-0.5 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Loại: </span>
            {ACTION_VI[item.action ?? ""] ?? item.action ?? "—"}
          </p>
          <p>
            <span className="font-medium text-foreground">Phạm vi: </span>
            {SCOPE_VI[item.scope ?? ""] ?? item.scope ?? "—"}
          </p>
          <p>
            <span className="font-medium text-foreground">Module: </span>
            {MODULE_META[item.module ?? ""]?.label ?? item.module ?? "—"}
          </p>
        </div>
        <p className="border-t pt-1.5 text-muted-foreground">
          {item.description}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface RolePermissionEditorProps {
  catalog: PermissionCatalogItem[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  /** Optional max-height class, e.g. "max-h-72". Defaults to "max-h-80". */
  maxHeightClass?: string
}

export function RolePermissionEditor({
  catalog,
  selected,
  onChange,
  maxHeightClass = "max-h-80",
}: RolePermissionEditorProps) {
  const [search, setSearch] = useState("")

  const groups = useMemo(() => buildGroups(catalog), [catalog])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        rows: g.rows.filter(
          (r) =>
            r.code.toLowerCase().includes(q) ||
            (r.description ?? "").toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.rows.length > 0)
  }, [groups, search])

  function toggle(code: string, checked: boolean) {
    const next = new Set(selected)
    if (checked) next.add(code)
    else next.delete(code)
    onChange(next)
  }

  function toggleModule(rows: PermissionCatalogItem[], allChecked: boolean) {
    const next = new Set(selected)
    for (const r of rows) {
      if (allChecked) next.delete(r.code)
      else next.add(r.code)
    }
    onChange(next)
  }

  const totalSelected = selected.size
  const totalAll = catalog.length

  return (
    <div className="space-y-2">
      {/* Search + summary */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Tìm quyền..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 flex-1 text-xs"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {totalSelected}/{totalAll} đã chọn
        </span>
      </div>

      {/* Groups */}
      <div
        className={`space-y-3 overflow-y-auto rounded-md border p-3 ${maxHeightClass}`}
      >
        {filtered.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Không tìm thấy quyền nào.
          </p>
        )}
        {filtered.map((group) => {
          const allChecked = group.rows.every((r) => selected.has(r.code))
          const someChecked = group.rows.some((r) => selected.has(r.code))
          const checkedCount = group.rows.filter((r) =>
            selected.has(r.code),
          ).length

          return (
            <div key={group.module} className="space-y-1.5">
              {/* Module header */}
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked && !allChecked
                    }}
                    onChange={() => toggleModule(group.rows, allChecked)}
                  />
                  <span className="text-xs font-semibold text-foreground">
                    {group.label}
                  </span>
                </label>
                <span className="text-xs text-muted-foreground">
                  {checkedCount}/{group.rows.length}
                </span>
              </div>

              {/* Permission rows */}
              <div className="grid gap-1 sm:grid-cols-2">
                {group.rows.map((item) => {
                  const checked = selected.has(item.code)
                  return (
                    <label
                      key={item.id ?? item.code}
                      className={[
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors",
                        checked
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 shrink-0 accent-primary"
                        checked={checked}
                        onChange={(e) => toggle(item.code, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1 leading-snug">
                        {item.description ?? item.code}
                      </span>
                      <PermissionInfoTooltip item={item} />
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

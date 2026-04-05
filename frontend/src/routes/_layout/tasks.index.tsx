import { Link, createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { TasksService, type TaskPublic } from "@/client"

export const Route = createFileRoute("/_layout/tasks/")({
  component: MyTasksPage,
  head: () => ({
    meta: [{ title: "Công việc của tôi" }],
  }),
})

type CompanyOption = {
  company_id: string
  company_name: string
}

type ProjectOption = {
  project_id: string
  project_name: string
  company_id: string
}

type MyTaskItem = {
  task: TaskPublic
  project_id: string
  project_name: string
  company_id: string
  company_name: string
}

type MyDashboardPayload = {
  overdue_critical?: MyTaskItem[]
  overdue_local?: MyTaskItem[]
  due_soon?: MyTaskItem[]
  today?: MyTaskItem[]
  companies?: CompanyOption[]
  projects?: ProjectOption[]
}

/**
 * Keeps rows that match optional company and project filters.
 */
function filterMyTaskItems(
  items: MyTaskItem[] | undefined,
  companyId: string,
  projectId: string,
): MyTaskItem[] {
  const list = items ?? []
  return list.filter((row) => {
    if (companyId && row.company_id !== companyId) {
      return false
    }
    if (projectId && row.project_id !== projectId) {
      return false
    }
    return true
  })
}

/**
 * Groups task rows by project for subsection headings.
 */
function groupByProject(rows: MyTaskItem[]) {
  const order: string[] = []
  const byKey = new Map<
    string,
    { project_name: string; company_name: string; items: MyTaskItem[] }
  >()
  for (const row of rows) {
    const key = `${row.company_id}::${row.project_id}`
    if (!byKey.has(key)) {
      order.push(key)
      byKey.set(key, {
        project_name: row.project_name,
        company_name: row.company_name,
        items: [],
      })
    }
    byKey.get(key)!.items.push(row)
  }
  return order.map((key) => {
    const bucket = byKey.get(key)!
    return { key, ...bucket }
  })
}

function TaskRow({ row }: { row: MyTaskItem }) {
  const task = row.task
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className="block rounded-lg border bg-white p-3 shadow-sm hover:bg-slate-50"
    >
      <p className="text-sm font-bold">{task.name}</p>
      <p className="text-[11px] text-muted-foreground">
        {row.company_name} · {row.project_name}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Hạn: {new Date(task.end_time).toLocaleString()}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase text-primary">{task.computed_status ?? task.status}</p>
    </Link>
  )
}

function Section({
  title,
  items,
}: {
  title: string
  items: MyTaskItem[]
}) {
  if (items.length === 0) {
    return null
  }
  const groups = groupByProject(items)
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold">{title}</h2>
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <p className="text-xs font-semibold text-primary">
            {group.project_name}
            <span className="font-normal text-muted-foreground"> — {group.company_name}</span>
          </p>
          <div className="space-y-2">
            {group.items.map((row) => (
              <TaskRow key={row.task.id} row={row} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function MyTasksPage() {
  const [companyFilter, setCompanyFilter] = useState("")
  const [projectFilter, setProjectFilter] = useState("")

  const dashboardQuery = useQuery({
    queryKey: ["my-tasks-dashboard"],
    queryFn: async () => (await TasksService.myDashboard()) as MyDashboardPayload,
  })

  const data = dashboardQuery.data

  const projectOptions = useMemo(() => {
    const all = data?.projects ?? []
    if (!companyFilter) {
      return all
    }
    return all.filter((p) => p.company_id === companyFilter)
  }, [data?.projects, companyFilter])

  const filtered = useMemo(() => {
    return {
      overdue_critical: filterMyTaskItems(data?.overdue_critical, companyFilter, projectFilter),
      overdue_local: filterMyTaskItems(data?.overdue_local, companyFilter, projectFilter),
      due_soon: filterMyTaskItems(data?.due_soon, companyFilter, projectFilter),
      today: filterMyTaskItems(data?.today, companyFilter, projectFilter),
    }
  }, [data, companyFilter, projectFilter])

  const totalFiltered =
    filtered.overdue_critical.length +
    filtered.overdue_local.length +
    filtered.due_soon.length +
    filtered.today.length

  const totalAll =
    (data?.overdue_critical?.length ?? 0) +
    (data?.overdue_local?.length ?? 0) +
    (data?.due_soon?.length ?? 0) +
    (data?.today?.length ?? 0)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 pb-24 pt-3 sm:px-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Công việc của tôi</h1>
        <p className="text-sm text-muted-foreground">
          Lọc theo công ty và dự án; trong mỗi mức ưu tiên, task được nhóm theo dự án.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-40 flex-1 space-y-1">
          <label htmlFor="my-tasks-company" className="text-xs font-semibold text-muted-foreground">
            Công ty
          </label>
          <select
            id="my-tasks-company"
            title="Lọc theo công ty"
            aria-label="Lọc theo công ty"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={companyFilter}
            onChange={(eventValue) => {
              setCompanyFilter(eventValue.target.value)
              setProjectFilter("")
            }}
            disabled={dashboardQuery.isLoading}
          >
            <option value="">Tất cả công ty</option>
            {(data?.companies ?? []).map((c) => (
              <option key={c.company_id} value={c.company_id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <label htmlFor="my-tasks-project" className="text-xs font-semibold text-muted-foreground">
            Dự án
          </label>
          <select
            id="my-tasks-project"
            title="Lọc theo dự án"
            aria-label="Lọc theo dự án"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={projectFilter}
            onChange={(eventValue) => setProjectFilter(eventValue.target.value)}
            disabled={dashboardQuery.isLoading}
          >
            <option value="">Tất cả dự án</option>
            {projectOptions.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.project_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dashboardQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : null}

      {dashboardQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được danh sách task.</p>
      ) : null}

      {!dashboardQuery.isLoading && !dashboardQuery.isError && totalAll === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Không có task đang mở. Khi được giao việc, danh sách sẽ hiển thị tại đây.
        </p>
      ) : null}

      {!dashboardQuery.isLoading && !dashboardQuery.isError && totalAll > 0 && totalFiltered === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Không có task nào khớp bộ lọc. Thử chọn &quot;Tất cả&quot; hoặc dự án khác.
        </p>
      ) : null}

      <Section title="Quá hạn (nghiêm trọng)" items={filtered.overdue_critical} />
      <Section title="Quá hạn (cảnh báo)" items={filtered.overdue_local} />
      <Section title="Sắp đến hạn" items={filtered.due_soon} />
      <Section title="Hôm nay" items={filtered.today} />
    </div>
  )
}

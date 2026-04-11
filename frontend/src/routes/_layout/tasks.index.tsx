import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMemo } from "react"

import { type TaskPublic, TasksService } from "@/client"

export const Route = createFileRoute("/_layout/tasks/")({
  component: MyTasksPage,
  head: () => ({
    meta: [{ title: "Công việc của tôi" }],
  }),
})

type ProjectBucket = {
  project_id: string
  project_name: string
  items: MyTaskItem[]
}

type CompanyBucket = {
  company_id: string
  company_name: string
  projects: ProjectBucket[]
}

type MyTaskItem = {
  task: TaskPublic
  project_id: string
  project_name: string
  company_id: string
  company_name: string
}

type AutoExpandTarget = {
  companyId: string
  projectId: string
}

type MyDashboardPayload = {
  overdue_critical?: MyTaskItem[]
  overdue_local?: MyTaskItem[]
  due_soon?: MyTaskItem[]
  today?: MyTaskItem[]
}

/**
 * Groups task rows by company, then project, with stable alphabetical ordering.
 */
function groupByCompanyThenProject(rows: MyTaskItem[]): CompanyBucket[] {
  const companyOrder: string[] = []
  const byCompany = new Map<
    string,
    {
      company_name: string
      projectOrder: string[]
      projects: Map<string, { project_name: string; items: MyTaskItem[] }>
    }
  >()

  for (const row of rows) {
    let companyEntry = byCompany.get(row.company_id)
    if (!companyEntry) {
      companyOrder.push(row.company_id)
      companyEntry = {
        company_name: row.company_name,
        projectOrder: [],
        projects: new Map(),
      }
      byCompany.set(row.company_id, companyEntry)
    }
    let projectEntry = companyEntry.projects.get(row.project_id)
    if (!projectEntry) {
      companyEntry.projectOrder.push(row.project_id)
      projectEntry = { project_name: row.project_name, items: [] }
      companyEntry.projects.set(row.project_id, projectEntry)
    }
    projectEntry.items.push(row)
  }

  const sortedCompanyIds = [...companyOrder].sort((a, b) => {
    const nameA = byCompany.get(a)?.company_name ?? ""
    const nameB = byCompany.get(b)?.company_name ?? ""
    return nameA.localeCompare(nameB, "vi", { sensitivity: "base" })
  })

  return sortedCompanyIds.map((companyId) => {
    const companyEntry = byCompany.get(companyId)!
    const sortedProjectIds = [...companyEntry.projectOrder].sort((a, b) => {
      const nameA = companyEntry.projects.get(a)?.project_name ?? ""
      const nameB = companyEntry.projects.get(b)?.project_name ?? ""
      return nameA.localeCompare(nameB, "vi", { sensitivity: "base" })
    })
    return {
      company_id: companyId,
      company_name: companyEntry.company_name,
      projects: sortedProjectIds.map((projectId) => {
        const projectEntry = companyEntry.projects.get(projectId)!
        return {
          project_id: projectId,
          project_name: projectEntry.project_name,
          items: projectEntry.items,
        }
      }),
    }
  })
}

/**
 * Pick one company/project branch to auto-open by nearest deadline.
 */
function pickAutoExpandTarget(rows: MyTaskItem[]): AutoExpandTarget | null {
  if (rows.length === 0) {
    return null
  }
  const sortedRows = rows
    .slice()
    .sort(
      (a, b) =>
        new Date(a.task.end_time).getTime() - new Date(b.task.end_time).getTime(),
    )
  const topRow = sortedRows[0]
  return {
    companyId: topRow.company_id,
    projectId: topRow.project_id,
  }
}

/**
 * Single task card linking to detail; optional company/project line when not inside a project tree.
 */
function TaskRow({
  row,
  showContext,
}: {
  row: MyTaskItem
  showContext?: boolean
}) {
  const task = row.task
  const context = showContext !== false
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className="block rounded-lg border bg-white p-3 shadow-sm hover:bg-slate-50"
    >
      <p className="text-sm font-bold">{task.name}</p>
      {context ? (
        <p className="text-[11px] text-muted-foreground">
          {row.company_name} · {row.project_name}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Hạn: {new Date(task.end_time).toLocaleString()}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase text-primary">
        {task.computed_status ?? task.status}
      </p>
    </Link>
  )
}

/**
 * Renders one priority band as nested company → project disclosure trees.
 */
function PriorityTreeSection({
  title,
  items,
}: {
  title: string
  items: MyTaskItem[]
}) {
  if (items.length === 0) {
    return null
  }
  const tree = groupByCompanyThenProject(items)
  const autoExpandTarget = pickAutoExpandTarget(items)
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold">{title}</h2>
      <div className="space-y-2">
        {tree.map((company) => {
          const companyTaskCount = company.projects.reduce(
            (n, p) => n + p.items.length,
            0,
          )
          const isAutoExpandCompany =
            autoExpandTarget?.companyId === company.company_id
          return (
            <details
              key={company.company_id}
              open={isAutoExpandCompany}
              className="group rounded-xl border border-slate-200 bg-slate-50/60 open:bg-slate-50/80"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-bold text-slate-800 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 truncate">{company.company_name}</span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {companyTaskCount} việc
                </span>
              </summary>
              <div className="space-y-2 border-t border-slate-200/80 bg-white px-2 py-3">
                {company.projects.map((project) => (
                  <details
                    key={project.project_id}
                    open={
                      isAutoExpandCompany &&
                      autoExpandTarget?.projectId === project.project_id
                    }
                    className="rounded-lg border border-slate-100 bg-slate-50/40 open:bg-white"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 pl-3 text-xs font-bold text-primary [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 truncate">
                        {project.project_name}
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
                        {project.items.length}
                      </span>
                    </summary>
                    <div className="space-y-2 border-t border-slate-100 p-2 pl-3">
                      {project.items.map((row) => (
                        <TaskRow
                          key={row.task.id}
                          row={row}
                          showContext={false}
                        />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Lists the current user’s tasks from my dashboard, grouped by priority and nested company → project.
 */
function MyTasksPage() {
  const dashboardQuery = useQuery({
    queryKey: ["my-tasks-dashboard"],
    queryFn: async () =>
      (await TasksService.myDashboard()) as MyDashboardPayload,
  })

  const data = dashboardQuery.data

  const totalAll = useMemo(() => {
    return (
      (data?.overdue_critical?.length ?? 0) +
      (data?.overdue_local?.length ?? 0) +
      (data?.due_soon?.length ?? 0) +
      (data?.today?.length ?? 0)
    )
  }, [data])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-2 pb-24 pt-3 sm:px-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Công việc của tôi
        </h1>
        <p className="text-sm text-muted-foreground">
          Mở từng công ty, rồi dự án để xem task. Các mức ưu tiên (quá hạn, sắp
          đến hạn…) giữ nguyên bên dưới.
        </p>
      </div>

      {dashboardQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : null}

      {dashboardQuery.isError ? (
        <p className="text-sm text-destructive">
          Không tải được danh sách task.
        </p>
      ) : null}

      {!dashboardQuery.isLoading &&
      !dashboardQuery.isError &&
      totalAll === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Không có task đang mở. Khi được giao việc, danh sách sẽ hiển thị tại
          đây.
        </p>
      ) : null}

      <PriorityTreeSection
        title="Quá hạn (nghiêm trọng)"
        items={data?.overdue_critical ?? []}
      />
      <PriorityTreeSection
        title="Quá hạn (cảnh báo)"
        items={data?.overdue_local ?? []}
      />
      <PriorityTreeSection title="Sắp đến hạn" items={data?.due_soon ?? []} />
      <PriorityTreeSection title="Hôm nay" items={data?.today ?? []} />
    </div>
  )
}

import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { ArrowLeft, FolderOpen, Plus } from "lucide-react"

import { ProjectsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { clearSession } from "@/modules/auth/tokenStore"
import { hasPermission } from "@/utils/accountAccess"
import { useMemo, useState } from "react"

export const Route = createFileRoute("/_layout/projects/")({
  beforeLoad: async () => {
    let permissions: string[] = []
    let isSuperuser = false
    try {
      const [rbac, { UsersService }] = await Promise.all([
        import("@/modules/rbac/rbacApi"),
        import("@/client"),
      ])
      ;[permissions] = await Promise.all([
        rbac.readMyPermissions(),
        UsersService.readUserMe().then((u) => { isSuperuser = Boolean(u.is_superuser) }),
      ])
    } catch (err: unknown) {
      const e = err as { status?: number }
      if (e?.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw err
    }
    const allowed = isSuperuser || hasPermission(permissions, "PROJECT_VIEW") || hasPermission(permissions, "PROJECT_VIEW_ALL")
    if (!allowed) {
      throw redirect({ to: "/" })
    }
  },
  component: ProjectsIndexPage,
  head: () => ({ meta: [{ title: "Dự án" }] }),
})

function ProjectsIndexPage() {
  const [keyword, setKeyword] = useState("")
  const projectsQuery = useQuery({
    queryKey: ["projects", "index"],
    queryFn: () => ProjectsService.listProjects({ limit: 200 }),
  })

  const filtered = useMemo(() => {
    const list = projectsQuery.data?.data ?? []
    const q = keyword.trim().toLowerCase()
    if (!q) return list
    return list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
  }, [projectsQuery.data, keyword])

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay lại tổng quan
          </Link>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Dự án</h1>
          </div>
        </div>
        <Link to="/quotations/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Tạo dự án
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tìm theo tên hoặc mã dự án..."
          className="h-9 max-w-md"
        />
      </div>

      <div className="rounded-xl border bg-card">
        {projectsQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Đang tải danh sách dự án...</p>
        ) : projectsQuery.isError ? (
          <p className="p-4 text-sm text-destructive">Không thể tải danh sách dự án.</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Chưa có dự án phù hợp.</p>
        ) : (
          <ul className="divide-y">
            {filtered.map((p) => (
              <li key={p.id} className="p-4 hover:bg-muted/30 transition-colors">
                <Link to="/projects/$projectId" params={{ projectId: p.id }} className="block">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.code}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}


import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, FolderOpen, Plus } from "lucide-react"

import { ProjectsService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LoadingButton } from "@/components/ui/loading-button"
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

const PROJECT_TYPE_LABELS: Record<string, string> = {
  client: "Dự án khách hàng",
  internal: "Dự án nội bộ",
}

function ProjectTypeBadge({ type }: { type?: string | null }) {
  if (!type) return null
  const label = PROJECT_TYPE_LABELS[type] ?? type
  const cls = type === "internal"
    ? "bg-purple-100 text-purple-700"
    : "bg-blue-100 text-blue-700"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

function ProjectsIndexPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("")
  const [typeDialogOpen, setTypeDialogOpen] = useState(false)
  const [internalNameDraft, setInternalNameDraft] = useState("")
  const [internalStartDate, setInternalStartDate] = useState("")
  const [internalEndDate, setInternalEndDate] = useState("")

  const createInternalMutation = useMutation({
    mutationFn: async () => {
      const name = internalNameDraft.trim()
      if (!name) throw new Error("Nhập tên dự án")
      const today = new Date()
      const pad = (n: number) => String(n).padStart(2, "0")
      const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      const defaultEnd = new Date(today)
      defaultEnd.setDate(today.getDate() + 30)
      return ProjectsService.createProject({
        requestBody: {
          name,
          code: `INT-${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`,
          description: null,
          start_date: internalStartDate || toISODate(today),
          end_date: internalEndDate || toISODate(defaultEnd),
          status: "planning",
          project_type: "internal",
        },
      })
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", "index"] })
      setTypeDialogOpen(false)
      setInternalNameDraft("")
      setInternalStartDate("")
      setInternalEndDate("")
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } })
    },
  })

  const projectsQuery = useQuery({
    queryKey: ["projects", "index"],
    queryFn: () => ProjectsService.listProjects({ limit: 200 }),
  })

  const filtered = useMemo(() => {
    const list = projectsQuery.data?.data ?? []
    const q = keyword.trim().toLowerCase()
    return list.filter((p) => {
      const matchKeyword = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
      const matchType = !typeFilter || (p as any).project_type === typeFilter
      return matchKeyword && matchType
    })
  }, [projectsQuery.data, keyword, typeFilter])

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
        <Button size="sm" className="gap-1.5" onClick={() => setTypeDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Tạo dự án
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tìm theo tên hoặc mã dự án..."
          className="h-9 max-w-md"
        />
        <Select
          value={typeFilter || "_all"}
          onValueChange={(v) => setTypeFilter(v === "_all" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-48 text-sm">
            <SelectValue placeholder="Loại dự án" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Tất cả loại</SelectItem>
            <SelectItem value="client">Dự án khách hàng</SelectItem>
            <SelectItem value="internal">Dự án nội bộ</SelectItem>
          </SelectContent>
        </Select>
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
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{p.name}</p>
                    <ProjectTypeBadge type={(p as any).project_type} />
                  </div>
                  <p className="text-xs text-muted-foreground">{p.code}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={typeDialogOpen} onOpenChange={(open) => { setTypeDialogOpen(open); if (!open) setInternalNameDraft("") }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tạo dự án mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Chọn loại dự án muốn tạo:</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-center hover:border-blue-400 transition-colors"
                onClick={() => { setTypeDialogOpen(false); navigate({ to: "/quotations/new" }) }}
              >
                <span className="text-2xl">📋</span>
                <span className="text-sm font-semibold text-blue-700">Dự án khách hàng</span>
                <span className="text-xs text-muted-foreground">Bắt đầu từ quy trình báo giá</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-purple-200 bg-purple-50 p-4 text-center hover:border-purple-400 transition-colors"
                onClick={() => document.getElementById("internal-name-input")?.focus()}
              >
                <span className="text-2xl">🏢</span>
                <span className="text-sm font-semibold text-purple-700">Dự án nội bộ</span>
                <span className="text-xs text-muted-foreground">Tạo trực tiếp, không cần báo giá</span>
              </button>
            </div>
            {true && (
              <div className="space-y-3 border-t pt-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Tên dự án nội bộ</p>
                  <Input
                    id="internal-name-input"
                    value={internalNameDraft}
                    onChange={(e) => setInternalNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && internalNameDraft.trim()) createInternalMutation.mutate() }}
                    placeholder="Nhập tên dự án nội bộ..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Ngày bắt đầu</p>
                    <Input type="date" value={internalStartDate} onChange={(e) => setInternalStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground">Ngày kết thúc</p>
                    <Input type="date" value={internalEndDate} onChange={(e) => setInternalEndDate(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>Hủy</Button>
            <LoadingButton
              loading={createInternalMutation.isPending}
              disabled={!internalNameDraft.trim()}
              onClick={() => createInternalMutation.mutate()}
            >
              Tạo nội bộ
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


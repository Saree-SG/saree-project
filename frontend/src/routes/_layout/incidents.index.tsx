import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Plus,
  Search,
  Wrench,
} from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea"
import { useCan } from "@/hooks/useMyPermissions"
import { listProjectsForAttendance } from "@/modules/attendance/attendanceApi"
import {
  categoryLabel,
  createIncident,
  getIncident,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  type Incident,
  listIncidents,
  resolveIncident,
  severityLabel,
  uploadIncidentAttachment,
} from "@/modules/incident/incidentApi"

export const Route = createFileRoute("/_layout/incidents/")({
  component: IncidentsPage,
  head: () => ({ meta: [{ title: "Sự cố thi công" }] }),
})

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function IncidentsPage() {
  const qc = useQueryClient()
  const canResolve = useCan("INCIDENT_RESOLVE")
  const [search, setSearch] = useState("")
  const [appliedQ, setAppliedQ] = useState("")
  const [category, setCategory] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ["incidents", appliedQ, category, statusFilter],
    queryFn: () =>
      listIncidents({
        q: appliedQ || undefined,
        category: category === "all" ? undefined : category,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
  })

  const incidents = listQuery.data?.data ?? []

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <AlertTriangle className="text-primary size-6" /> Sự cố thi công
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ghi nhận lỗi/sự cố kèm nguyên nhân &amp; giải pháp — tra cứu cho lần
            sau.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Báo sự cố
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-50 flex-1 gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAppliedQ(search)}
            placeholder="Tìm tiêu đề / mô tả / giải pháp…"
          />
          <Button variant="outline" onClick={() => setAppliedQ(search)}>
            <Search className="size-4" />
          </Button>
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả hạng mục</SelectItem>
            {INCIDENT_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi trạng thái</SelectItem>
            <SelectItem value="open">Đang mở</SelectItem>
            <SelectItem value="resolved">Đã xử lý</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="space-y-2">
        {listQuery.isLoading ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Đang tải…
          </p>
        ) : incidents.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
            <AlertTriangle className="size-8 opacity-40" />
            Chưa có sự cố nào.
          </div>
        ) : (
          incidents.map((it) => (
            <Card
              key={it.id}
              className="hover:bg-muted/40 cursor-pointer transition-colors"
              onClick={() => setDetailId(it.id)}
            >
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{it.title}</span>
                    {it.status === "resolved" ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="size-3" /> đã xử lý
                      </Badge>
                    ) : (
                      <Badge variant="destructive">đang mở</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-sm">
                    {it.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <Badge variant="outline">
                      {categoryLabel(it.category)}
                    </Badge>
                    <span
                      className={`rounded-full px-2 py-0.5 ${SEVERITY_STYLE[it.severity]}`}
                    >
                      {severityLabel(it.severity)}
                    </span>
                    <span className="text-muted-foreground">
                      {fmtDate(it.created_at)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <CreateIncidentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false)
          qc.invalidateQueries({ queryKey: ["incidents"] })
        }}
      />

      {detailId && (
        <IncidentDetailDialog
          incidentId={detailId}
          canResolve={canResolve}
          onClose={() => setDetailId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["incidents"] })}
        />
      )}
    </div>
  )
}

function CreateIncidentDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("other")
  const [severity, setSeverity] = useState("medium")
  const [projectId, setProjectId] = useState<string>("none")

  const projectsQuery = useQuery({
    queryKey: ["attendance-projects"],
    queryFn: listProjectsForAttendance,
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () => {
      if (!title.trim()) throw new Error("Hãy nhập tiêu đề")
      if (!description.trim()) throw new Error("Hãy mô tả sự cố")
      return createIncident({
        title,
        description,
        category,
        severity,
        project_id: projectId === "none" ? null : projectId,
      })
    },
    onSuccess: () => {
      toast.success("Đã ghi nhận sự cố")
      setTitle("")
      setDescription("")
      setCategory("other")
      setSeverity("medium")
      setProjectId("none")
      onCreated()
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? e?.message ?? "Lưu thất bại"),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Báo sự cố thi công</DialogTitle>
          <DialogDescription>
            Mô tả sự cố. Nguyên nhân &amp; giải pháp có thể bổ sung sau khi xử
            lý.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề sự cố"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả chi tiết hiện tượng…"
            rows={4}
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_SEVERITIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Công trình (tuỳ chọn)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Không gắn công trình</SelectItem>
              {projectsQuery.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Đang lưu…" : "Ghi nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IncidentDetailDialog({
  incidentId,
  canResolve,
  onClose,
  onChanged,
}: {
  incidentId: string
  canResolve: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rootCause, setRootCause] = useState("")
  const [solution, setSolution] = useState("")

  const query = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => getIncident(incidentId),
  })
  const it: Incident | undefined = query.data

  function refresh() {
    qc.invalidateQueries({ queryKey: ["incident", incidentId] })
    onChanged()
  }

  const resolveMutation = useMutation({
    mutationFn: () => {
      if (!rootCause.trim() || !solution.trim())
        throw new Error("Nhập cả nguyên nhân và giải pháp")
      return resolveIncident(incidentId, {
        root_cause: rootCause,
        solution,
      })
    },
    onSuccess: () => {
      toast.success("Đã đóng sự cố")
      refresh()
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? e?.message ?? "Thất bại"),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadIncidentAttachment(incidentId, file),
    onSuccess: () => {
      toast.success("Đã tải ảnh lên")
      refresh()
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.detail ?? e?.message ?? "Tải ảnh thất bại",
      ),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto">
        {!it ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Đang tải…
          </p>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {it.title}
                {it.status === "resolved" ? (
                  <Badge variant="secondary">đã xử lý</Badge>
                ) : (
                  <Badge variant="destructive">đang mở</Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {categoryLabel(it.category)} · {severityLabel(it.severity)} ·{" "}
                {fmtDate(it.created_at)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div>
                <div className="text-muted-foreground mb-1 text-xs font-medium">
                  Mô tả
                </div>
                <p className="whitespace-pre-wrap">{it.description}</p>
              </div>

              {it.root_cause && (
                <div>
                  <div className="text-muted-foreground mb-1 text-xs font-medium">
                    Nguyên nhân
                  </div>
                  <p className="whitespace-pre-wrap">{it.root_cause}</p>
                </div>
              )}
              {it.solution && (
                <div>
                  <div className="text-muted-foreground mb-1 text-xs font-medium">
                    Giải pháp
                  </div>
                  <p className="whitespace-pre-wrap">{it.solution}</p>
                </div>
              )}

              {/* Attachments */}
              <div>
                <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs font-medium">
                  <span>Ảnh / Tài liệu</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadMutation.mutate(f)
                      if (fileRef.current) fileRef.current.value = ""
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={uploadMutation.isPending}
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus className="size-4" /> Thêm ảnh
                  </Button>
                </div>
                {it.attachments.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {it.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.file_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={a.file_url}
                          alt="evidence"
                          className="h-24 w-full rounded-md object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">Chưa có ảnh.</p>
                )}
              </div>

              {/* Resolve form */}
              {it.status !== "resolved" && canResolve && (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Wrench className="size-4" /> Xử lý sự cố
                  </div>
                  <Textarea
                    value={rootCause}
                    onChange={(e) => setRootCause(e.target.value)}
                    placeholder="Nguyên nhân…"
                    rows={2}
                  />
                  <Textarea
                    value={solution}
                    onChange={(e) => setSolution(e.target.value)}
                    placeholder="Giải pháp khắc phục…"
                    rows={2}
                  />
                  <Button
                    className="w-full"
                    disabled={resolveMutation.isPending}
                    onClick={() => resolveMutation.mutate()}
                  >
                    {resolveMutation.isPending ? "Đang lưu…" : "Đóng sự cố"}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

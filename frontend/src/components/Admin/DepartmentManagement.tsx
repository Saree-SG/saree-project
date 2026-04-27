import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import useCustomToast from "@/hooks/useCustomToast"
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
  type Department,
} from "@/modules/org/departmentApi"
import { handleError } from "@/utils"

const DEPT_TYPE_OPTIONS = [
  { value: "office_block", label: "Khối văn phòng" },
  { value: "project_block", label: "Khối công trình" },
]

function deptTypeLabel(type: string | null) {
  return DEPT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "—"
}

type Props = { companyId: string }

export default function DepartmentManagement({ companyId }: Props) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", companyId],
    queryFn: () => listDepartments(companyId),
    enabled: Boolean(companyId),
  })

  // ── Create state ──────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createType, setCreateType] = useState<string>("")
  const [createParentId, setCreateParentId] = useState<string>("")

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [editName, setEditName] = useState("")
  const [editType, setEditType] = useState<string>("")
  const [editIsActive, setEditIsActive] = useState(true)
  const [editParentId, setEditParentId] = useState<string>("")

  // ── Delete state ──────────────────────────────────────────────────────────
  const [deletingDept, setDeletingDept] = useState<Department | null>(null)

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["departments", companyId] })

  const invalidateOrgTree = () =>
    queryClient.invalidateQueries({ queryKey: ["roles", "org-tree", companyId] })

  const toNullable = (v: string) => (v && v !== "none" ? v : null)

  const createMutation = useMutation({
    mutationFn: () =>
      createDepartment(companyId, {
        name: createName.trim(),
        dept_type: toNullable(createType),
        parent_id: toNullable(createParentId),
      }),
    onSuccess: async () => {
      showSuccessToast("Phòng ban đã được tạo")
      await invalidate()
      await invalidateOrgTree()
      setCreateOpen(false)
      setCreateName("")
      setCreateType("")
      setCreateParentId("")
    },
    onError: (err) => handleError.call(showErrorToast, err as any),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingDept) throw new Error("No department selected")
      return updateDepartment(companyId, editingDept.id, {
        name: editName.trim() || undefined,
        dept_type: toNullable(editType),
        is_active: editIsActive,
        parent_id: toNullable(editParentId),
      })
    },
    onSuccess: async () => {
      showSuccessToast("Cập nhật phòng ban thành công")
      await invalidate()
      await invalidateOrgTree()
      setEditingDept(null)
    },
    onError: (err) => handleError.call(showErrorToast, err as any),
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!deletingDept) throw new Error("No department selected")
      return deleteDepartment(companyId, deletingDept.id)
    },
    onSuccess: async () => {
      showSuccessToast("Đã xóa phòng ban")
      await invalidate()
      await invalidateOrgTree()
      setDeletingDept(null)
    },
    onError: (err) => handleError.call(showErrorToast, err as any),
  })

  function openEdit(dept: Department) {
    setEditingDept(dept)
    setEditName(dept.name)
    setEditType(dept.dept_type ?? "")
    setEditIsActive(dept.is_active)
    setEditParentId(dept.parent_id ?? "")
  }

  const parentOptions = departments.filter(
    (d) => d.id !== editingDept?.id,
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Phòng ban</p>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-4" />
          Thêm phòng ban
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên phòng ban</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Thuộc phòng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  Chưa có phòng ban nào.
                </TableCell>
              </TableRow>
            ) : null}
            {departments.map((dept) => {
              const parent = departments.find((d) => d.id === dept.parent_id)
              return (
                <TableRow key={dept.id}>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {deptTypeLabel(dept.dept_type)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {parent ? parent.name : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={dept.is_active ? "default" : "secondary"}>
                      {dept.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(dept)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeletingDept(dept)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Create Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm phòng ban</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Tên phòng ban"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
            <Select value={createType} onValueChange={setCreateType}>
              <SelectTrigger>
                <SelectValue placeholder="Loại phòng ban (tùy chọn)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Không chọn —</SelectItem>
                {DEPT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={createParentId} onValueChange={setCreateParentId}>
              <SelectTrigger>
                <SelectValue placeholder="Thuộc phòng ban (tùy chọn)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Không có —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <LoadingButton
              loading={createMutation.isPending}
              disabled={!createName.trim()}
              onClick={() => createMutation.mutate()}
            >
              Tạo
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={Boolean(editingDept)}
        onOpenChange={(open) => { if (!open) setEditingDept(null) }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa phòng ban</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Tên phòng ban"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Select value={editType} onValueChange={setEditType}>
              <SelectTrigger>
                <SelectValue placeholder="Loại phòng ban" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Không chọn —</SelectItem>
                {DEPT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={editParentId}
              onValueChange={setEditParentId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Thuộc phòng ban" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Không có —</SelectItem>
                {parentOptions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
              />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDept(null)}>
              Hủy
            </Button>
            <LoadingButton
              loading={updateMutation.isPending}
              disabled={!editName.trim()}
              onClick={() => updateMutation.mutate()}
            >
              Lưu
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <Dialog
        open={Boolean(deletingDept)}
        onOpenChange={(open) => { if (!open) setDeletingDept(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Xóa phòng ban?</DialogTitle>
            <DialogDescription>
              Phòng ban <strong>{deletingDept?.name}</strong> sẽ bị xóa vĩnh
              viễn. Hành động này không thể hoàn tác. Đảm bảo không còn nhân
              viên nào thuộc phòng ban này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingDept(null)}>
              Hủy
            </Button>
            <LoadingButton
              loading={deleteMutation.isPending}
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
            >
              Xóa
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, Workflow } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { LeaveApproverConfigItem } from "@/client"
import { RolesService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getLeaveApproverConfig,
  setLeaveApproverConfig,
} from "@/modules/leave/leaveApi"

type Draft = {
  step_order: number
  kind: "role" | "user"
  target_id: string
}

function errMsg(e: any, fallback: string): string {
  return e?.body?.detail ?? e?.response?.data?.detail ?? e?.message ?? fallback
}

export default function LeaveApprovalConfigPanel({
  companyId,
}: {
  companyId: string | null
}) {
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Draft[]>([])

  const configQuery = useQuery({
    queryKey: ["leave-approver-config", companyId],
    queryFn: () => getLeaveApproverConfig(companyId as string),
    enabled: Boolean(companyId),
  })

  const rolesQuery = useQuery({
    queryKey: ["roles", "catalog", companyId],
    queryFn: () =>
      RolesService.listCompanyRoles({ companyId: companyId as string }),
    enabled: Boolean(companyId),
  })

  const membersQuery = useQuery({
    queryKey: ["company-members", companyId],
    queryFn: () =>
      RolesService.listCompanyMembers({ companyId: companyId as string }),
    enabled: Boolean(companyId),
  })

  // Seed drafts from the saved config whenever it loads.
  useEffect(() => {
    const rows = configQuery.data?.data ?? []
    setDrafts(
      rows.map((r) => ({
        step_order: r.step_order,
        kind: r.approver_user_id ? "user" : "role",
        target_id: r.approver_user_id ?? r.approver_role_id ?? "",
      })),
    )
  }, [configQuery.data])

  const saveMutation = useMutation({
    mutationFn: () => {
      const items: LeaveApproverConfigItem[] = drafts
        .filter((d) => d.target_id)
        .map((d) => ({
          step_order: d.step_order,
          approver_role_id: d.kind === "role" ? d.target_id : null,
          approver_user_id: d.kind === "user" ? d.target_id : null,
        }))
      return setLeaveApproverConfig(companyId as string, items)
    },
    onSuccess: () => {
      toast.success("Đã lưu cấu hình người duyệt")
      qc.invalidateQueries({ queryKey: ["leave-approver-config", companyId] })
    },
    onError: (e: any) => toast.error(errMsg(e, "Lưu cấu hình thất bại")),
  })

  if (!companyId) {
    return (
      <p className="text-sm text-muted-foreground">Chọn công ty để cấu hình.</p>
    )
  }

  const usesDefault = configQuery.data?.uses_default ?? true
  const roles = rolesQuery.data ?? []
  const members = membersQuery.data ?? []

  const addRow = () =>
    setDrafts((prev) => [
      ...prev,
      { step_order: prev.length + 1, kind: "role", target_id: "" },
    ])

  const updateRow = (idx: number, patch: Partial<Draft>) =>
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    )

  const removeRow = (idx: number) =>
    setDrafts((prev) => prev.filter((_, i) => i !== idx))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Workflow className="size-5 text-primary" /> Người duyệt nghỉ phép
        </CardTitle>
        <CardDescription>
          Cấu hình role hoặc người cụ thể được duyệt đơn nghỉ. Bước (step) nhỏ
          hơn duyệt trước. Để trống = mặc định gửi tới Giám đốc.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {usesDefault && drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Đang dùng mặc định: đơn nghỉ được gửi tới <b>Giám đốc</b>.
          </p>
        ) : null}

        <div className="space-y-3">
          {drafts.map((d, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-end"
            >
              <div className="w-full space-y-1 sm:w-24">
                <span className="block text-xs text-muted-foreground">
                  Bước
                </span>
                <Input
                  type="number"
                  min={1}
                  value={d.step_order}
                  onChange={(e) =>
                    updateRow(idx, {
                      step_order: Number(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div className="w-full space-y-1 sm:w-36">
                <span className="block text-xs text-muted-foreground">
                  Loại
                </span>
                <Select
                  value={d.kind}
                  onValueChange={(v) =>
                    updateRow(idx, {
                      kind: v as "role" | "user",
                      target_id: "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role">Theo vai trò</SelectItem>
                    <SelectItem value="user">Theo người</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full flex-1 space-y-1">
                <span className="block text-xs text-muted-foreground">
                  {d.kind === "role" ? "Vai trò" : "Người duyệt"}
                </span>
                <Select
                  value={d.target_id}
                  onValueChange={(v) => updateRow(idx, { target_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn..." />
                  </SelectTrigger>
                  <SelectContent>
                    {d.kind === "role"
                      ? roles
                          .filter((r) => r.id)
                          .map((r) => (
                            <SelectItem key={r.id} value={r.id as string}>
                              {r.display_name}
                            </SelectItem>
                          ))
                      : members.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.full_name || m.email}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => removeRow(idx)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={addRow}>
            <Plus className="size-4" /> Thêm bước duyệt
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            Lưu cấu hình
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

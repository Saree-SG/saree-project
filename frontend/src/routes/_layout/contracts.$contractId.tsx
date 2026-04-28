import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Info,
  Paperclip,
  Trash2,
} from "lucide-react"
import { Link } from "@tanstack/react-router"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  StageTransitionTimeline,
  type ActionConfig,
  type TransitionAttachment as TLAttachment,
} from "@/components/Common/StageTransitionTimeline"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileTypeIcon } from "@/components/ui/FileTypeIcon"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { clearSession } from "@/modules/auth/tokenStore"
import {
  approveContract,
  completeContract,
  confirmAdvance,
  deleteContractAttachment,
  getContract,
  rejectContract,
  signContract,
  startProduction,
  submitContract,
  uploadContractAttachment,
} from "@/modules/contract/contractApi"
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_ORDER,
  type ContractAttachmentPublic,
  type ContractStatus,
} from "@/modules/contract/contractTypes"
import { hasPermission } from "@/utils/accountAccess"
import { resolveBackendMediaUrl } from "@/utils/mediaUrl"

export const Route = createFileRoute("/_layout/contracts/$contractId")({
  beforeLoad: async () => {
    let permissions: string[]
    try {
      permissions = await import("@/modules/rbac/rbacApi").then((m) =>
        m.readMyPermissions(),
      )
    } catch (err: unknown) {
      const e = err as { status?: number }
      if (e?.status === 401) {
        clearSession()
        throw redirect({ to: "/login" })
      }
      throw err
    }
    if (
      !hasPermission(permissions, "CONTRACT_VIEW") &&
      !hasPermission(permissions, "CONTRACT_VIEW_ALL")
    ) {
      throw redirect({ to: "/" })
    }
    return { permissions }
  },
  component: ContractDetailPage,
  head: () => ({ meta: [{ title: "Chi tiết hợp đồng" }] }),
})

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_approval: "bg-amber-100 text-amber-700",
  sent: "bg-blue-100 text-blue-700",
  signed: "bg-purple-100 text-purple-700",
  advance_received: "bg-yellow-100 text-yellow-700",
  in_production: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
}

/**
 * Mô tả rõ từng bước trong flow hợp đồng theo góc nhìn của khách hàng.
 */
const CONTRACT_ACTION_CONFIG: Record<string, ActionConfig> = {
  create:           { subject: "Hợp đồng",           status: "Đã tạo mới",                   statusType: "created"  },
  submit:           { subject: "Hợp đồng",           status: "Đã gửi BGĐ phê duyệt",          statusType: "pending"  },
  approve:          { subject: "Hợp đồng",           status: "BGĐ đã phê duyệt – Gửi khách", statusType: "approved" },
  reject:           { subject: "Hợp đồng",           status: "BGĐ yêu cầu chỉnh sửa",         statusType: "rejected" },
  sign:             { subject: "Hợp đồng",           status: "Khách hàng đã ký kết",           statusType: "approved" },
  confirm_advance:  { subject: "Thanh toán tạm ứng", status: "Đã xác nhận nhận tiền",          statusType: "approved" },
  start_production: { subject: "Sản xuất",           status: "Bắt đầu triển khai",             statusType: "sent"     },
  complete:         { subject: "Hợp đồng",           status: "Hoàn thành",                     statusType: "won"      },
}

// Map action → phase tag stored on the attachment
const ACTION_TO_PHASE: Record<string, string> = {
  submit: "pending_approval",
  approve: "sent",
  sign: "signed",
  confirm_advance: "advance_received",
  start_production: "in_production",
  complete: "completed",
}

function buildWorkflowNote(title: string, contentHtml: string): string {
  const blocks: string[] = []
  if (title.trim()) blocks.push(`# ${title.trim()}`)
  if (contentHtml.trim()) blocks.push(contentHtml.trim())
  return blocks.join("\n\n").trim()
}

type ActionDef = { label: string; permission: string; action: string }

const STATUS_ACTIONS: Record<ContractStatus, ActionDef | ActionDef[] | null> = {
  draft: { label: "Nộp BGĐ duyệt →", permission: "CONTRACT_SUBMIT", action: "submit" },
  pending_approval: [
    { label: "Duyệt & Gửi khách hàng ✓", permission: "CONTRACT_APPROVE", action: "approve" },
    { label: "Từ chối ✗", permission: "CONTRACT_APPROVE", action: "reject" },
  ],
  sent: { label: "Xác nhận đã ký →", permission: "CONTRACT_SIGN", action: "sign" },
  signed: { label: "Xác nhận nhận tạm ứng →", permission: "CONTRACT_CONFIRM_ADVANCE", action: "confirm_advance" },
  advance_received: { label: "Chuyển sang sản xuất →", permission: "CONTRACT_START_PRODUCTION", action: "start_production" },
  in_production: { label: "Hoàn thành hợp đồng ✓", permission: "CONTRACT_COMPLETE", action: "complete" },
  completed: null,
}

function ContractDetailPage() {
  const { contractId } = Route.useParams()
  const { permissions } = Route.useRouteContext()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: contract, isLoading } = useQuery({
    queryKey: ["contract", contractId],
    queryFn: () => getContract(contractId),
  })

  const [actionDialog, setActionDialog] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null)
  const [selectedHistoryStatus, setSelectedHistoryStatus] = useState<ContractStatus | null>(null)

  // sign
  const [signingDate, setSigningDate] = useState(new Date().toISOString().split("T")[0])
  const [signTitle, setSignTitle] = useState("")
  const [signBodyHtml, setSignBodyHtml] = useState("")
  const signBodyRef = useRef<HTMLDivElement | null>(null)
  const [actionAttachmentFile, setActionAttachmentFile] = useState<File | null>(null)
  const [actionAttachmentType, setActionAttachmentType] = useState("document")

  // send
  const [sendTitle, setSendTitle] = useState("")
  const [sendBodyHtml, setSendBodyHtml] = useState("")
  const sendBodyRef = useRef<HTMLDivElement | null>(null)

  // confirm_advance
  const [advanceAmount, setAdvanceAmount] = useState("")
  const [advancePaidAt, setAdvancePaidAt] = useState(new Date().toISOString().slice(0, 16))
  const [advanceTitle, setAdvanceTitle] = useState("")
  const [advanceBodyHtml, setAdvanceBodyHtml] = useState("")
  const advanceBodyRef = useRef<HTMLDivElement | null>(null)

  // start_production
  const [startTitle, setStartTitle] = useState("")
  const [startBodyHtml, setStartBodyHtml] = useState("")
  const startBodyRef = useRef<HTMLDivElement | null>(null)

  // complete
  const [completeTitle, setCompleteTitle] = useState("")
  const [completeBodyHtml, setCompleteBodyHtml] = useState("")
  const completeBodyRef = useRef<HTMLDivElement | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ["contract", contractId] })

  const filteredTransitions = useMemo(() => {
    if (!contract) {
      return []
    }
    if (!selectedHistoryStatus) {
      return [...contract.transitions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    }
    return [...contract.transitions]
      .filter(
        (t) => t.to_status === selectedHistoryStatus || t.from_status === selectedHistoryStatus,
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [contract, selectedHistoryStatus])

  function resetAll() {
    setSendTitle(""); setSendBodyHtml(""); if (sendBodyRef.current) sendBodyRef.current.innerHTML = ""
    setSignTitle(""); setSignBodyHtml("")
    if (signBodyRef.current) signBodyRef.current.innerHTML = ""
    setAdvanceTitle(""); setAdvanceBodyHtml(""); if (advanceBodyRef.current) advanceBodyRef.current.innerHTML = ""
    setStartTitle(""); setStartBodyHtml(""); if (startBodyRef.current) startBodyRef.current.innerHTML = ""
    setCompleteTitle(""); setCompleteBodyHtml(""); if (completeBodyRef.current) completeBodyRef.current.innerHTML = ""
    setActionAttachmentFile(null)
    setActionAttachmentType("document")
  }

  const actionMutation = useMutation({
    mutationFn: async (action: string) => {
      if (!contract) return
      const phase = ACTION_TO_PHASE[action]
      if (action === "submit") {
        if (actionAttachmentFile && phase) {
          await uploadContractAttachment(contractId, actionAttachmentFile, actionAttachmentType, sendTitle || undefined, phase)
        }
        return submitContract(contractId, buildWorkflowNote(sendTitle, sendBodyHtml) || undefined)
      }
      if (action === "approve") {
        if (actionAttachmentFile && phase) {
          await uploadContractAttachment(contractId, actionAttachmentFile, actionAttachmentType, sendTitle || undefined, phase)
        }
        return approveContract(contractId, buildWorkflowNote(sendTitle, sendBodyHtml) || undefined)
      }
      if (action === "reject") {
        return rejectContract(contractId, buildWorkflowNote(sendTitle, sendBodyHtml) || undefined)
      }
      if (action === "sign") {
        if (!actionAttachmentFile) throw new Error("Vui lòng đính kèm file hợp đồng đã ký.")
        await uploadContractAttachment(contractId, actionAttachmentFile, actionAttachmentType, signTitle || undefined, phase)
        return signContract(contractId, signingDate, buildWorkflowNote(signTitle, signBodyHtml) || undefined)
      }
      if (action === "confirm_advance") {
        if (actionAttachmentFile && phase) {
          await uploadContractAttachment(contractId, actionAttachmentFile, actionAttachmentType, advanceTitle || undefined, phase)
        }
        return confirmAdvance(contractId, Number(advanceAmount), new Date(advancePaidAt).toISOString(), buildWorkflowNote(advanceTitle, advanceBodyHtml) || undefined)
      }
      if (action === "start_production") {
        if (actionAttachmentFile && phase) {
          await uploadContractAttachment(contractId, actionAttachmentFile, actionAttachmentType, startTitle || undefined, phase)
        }
        return startProduction(contractId, buildWorkflowNote(startTitle, startBodyHtml) || undefined)
      }
      if (action === "complete") {
        if (actionAttachmentFile && phase) {
          await uploadContractAttachment(contractId, actionAttachmentFile, actionAttachmentType, completeTitle || undefined, phase)
        }
        return completeContract(contractId, buildWorkflowNote(completeTitle, completeBodyHtml) || undefined)
      }
    },
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái hợp đồng")
      setActionDialog(null)
      resetAll()
      invalidate()
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } } }
      toast.error(e?.response?.data?.detail ?? "Thao tác thất bại")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (attId: string) => deleteContractAttachment(contractId, attId),
    onSuccess: () => { toast.success("Đã xóa file"); invalidate() },
  })

  const uploadMutation = useMutation({
    mutationFn: ({ file, fileType }: { file: File; fileType: string }) =>
      uploadContractAttachment(contractId, file, fileType),
    onSuccess: () => { toast.success("Đã upload file"); invalidate() },
  })

  if (isLoading) return <div className="p-6 text-muted-foreground">Đang tải...</div>
  if (!contract) return <div className="p-6 text-destructive">Không tìm thấy hợp đồng.</div>

  const status = contract.status as ContractStatus
  const actionDef = STATUS_ACTIONS[status]
  const actionDefs = Array.isArray(actionDef) ? actionDef : actionDef ? [actionDef] : []
  const canAct = actionDefs.length > 0 && actionDefs.some(a => hasPermission(permissions, a.permission))

  function openAttachment(att: ContractAttachmentPublic) {
    const ext = att.file_name.split(".").pop()?.toLowerCase() ?? ""
    const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)
    if (isImage) {
      setImagePreview({ url: resolveBackendMediaUrl(att.file_url), name: att.file_name })
    } else {
      const a = document.createElement("a")
      a.href = resolveBackendMediaUrl(att.file_url)
      a.download = att.file_name
      a.rel = "noreferrer"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/contracts" })}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{contract.contract_number}</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
            {contract.status_label ?? CONTRACT_STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      {/* Status stepper */}
      <StatusStepper
        currentStatus={status}
        selectedStatus={selectedHistoryStatus}
        onStepClick={setSelectedHistoryStatus}
      />

      {/* Next steps guide */}
      {status !== "completed" && (
        <NextStepsGuide status={status} projectId={contract.project_id} />
      )}

      {/* Action button(s) */}
      {canAct && actionDefs.length > 0 && (
        <div className="flex justify-end gap-2">
          {actionDefs.filter(a => hasPermission(permissions, a.permission)).map(a => (
            <Button
              key={a.action}
              variant={a.action === "reject" ? "outline" : "default"}
              onClick={() => setActionDialog(a.action)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {/* Contract info */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Thông tin hợp đồng
        </h2>
        <InfoRow label="Số hợp đồng" value={contract.contract_number} />
        <InfoRow label="Ngày hợp đồng" value={new Date(contract.contract_date).toLocaleDateString("vi-VN")} />
        {contract.signing_date && (
          <InfoRow label="Ngày ký" value={new Date(contract.signing_date).toLocaleDateString("vi-VN")} />
        )}
        <InfoRow label="Giá trị" value={`${contract.total_value.toLocaleString("vi-VN")} ${contract.currency}`} />
        {contract.advance_amount && (
          <InfoRow label="Tạm ứng" value={`${contract.advance_amount.toLocaleString("vi-VN")} ${contract.currency}`} />
        )}
        {contract.advance_paid_at && (
          <InfoRow label="Ngày nhận tạm ứng" value={new Date(contract.advance_paid_at).toLocaleDateString("vi-VN")} />
        )}
        {contract.notes && <InfoRow label="Ghi chú" value={contract.notes} />}
      </div>

      {/* Documents summary */}
      <DocumentsSection
        attachments={contract.attachments}
        canUpdate={hasPermission(permissions, "CONTRACT_UPDATE")}
        onView={openAttachment}
        onDelete={(id) => deleteMutation.mutate(id)}
        onUpload={(file) => uploadMutation.mutate({ file, fileType: "document" })}
      />

      {/* History timeline */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Lịch sử thay đổi
          </h2>
          {selectedHistoryStatus ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSelectedHistoryStatus(null)}
            >
              Bỏ lọc
            </Button>
          ) : null}
        </div>
        {selectedHistoryStatus ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Đang lọc theo bước:{" "}
            <span className="font-semibold text-foreground">
              {CONTRACT_STATUS_LABELS[selectedHistoryStatus]}
            </span>
          </div>
        ) : null}
        {filteredTransitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có lịch sử</p>
        ) : (
          <StageTransitionTimeline
            entries={filteredTransitions.map((t) => ({
                id: t.id,
                from_key: t.from_status ?? undefined,
                to_key: t.to_status ?? undefined,
                from_label: t.from_status ? (CONTRACT_STATUS_LABELS[t.from_status as ContractStatus] ?? t.from_status) : undefined,
                to_label: t.to_status ? (CONTRACT_STATUS_LABELS[t.to_status as ContractStatus] ?? t.to_status) : (t.action ?? ""),
                action: t.action,
                actor_name: t.actor_name,
                created_at: t.created_at,
                note: t.note,
              }))}
            attachments={contract.attachments.map((a): TLAttachment => ({
              id: a.id,
              stage_key: a.phase ?? "",
              file_name: a.file_name,
              file_url: a.file_url,
              file_type: a.file_type,
            }))}
            actionConfig={CONTRACT_ACTION_CONFIG}
            onViewAttachment={(att) => {
              const original = contract.attachments.find((a) => a.id === att.id)
              if (original) openAttachment(original)
            }}
          />
        )}
      </div>

      {/* ── Dialog: Nộp BGĐ duyệt ── */}
      <Dialog open={actionDialog === "submit"} onOpenChange={(v) => !v && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nộp hợp đồng lên BGĐ duyệt</DialogTitle></DialogHeader>
          <RichNoteEditor title={sendTitle} onTitleChange={setSendTitle} bodyRef={sendBodyRef} onBodyInput={setSendBodyHtml} />
          <PhaseAttachmentPicker
            file={actionAttachmentFile}
            fileType={actionAttachmentType}
            onFileChange={setActionAttachmentFile}
            onFileTypeChange={setActionAttachmentType}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Hủy</Button>
            <Button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("submit")}>
              {actionMutation.isPending ? "Đang lưu..." : "Nộp duyệt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: BGĐ duyệt & gửi khách ── */}
      <Dialog open={actionDialog === "approve"} onOpenChange={(v) => !v && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Duyệt hợp đồng & Gửi cho khách hàng</DialogTitle></DialogHeader>
          <RichNoteEditor title={sendTitle} onTitleChange={setSendTitle} bodyRef={sendBodyRef} onBodyInput={setSendBodyHtml} />
          <PhaseAttachmentPicker
            file={actionAttachmentFile}
            fileType={actionAttachmentType}
            onFileChange={setActionAttachmentFile}
            onFileTypeChange={setActionAttachmentType}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Hủy</Button>
            <Button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("approve")}>
              {actionMutation.isPending ? "Đang lưu..." : "Duyệt & Gửi khách"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: BGĐ từ chối ── */}
      <Dialog open={actionDialog === "reject"} onOpenChange={(v) => !v && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Từ chối hợp đồng</DialogTitle></DialogHeader>
          <RichNoteEditor title={sendTitle} onTitleChange={setSendTitle} bodyRef={sendBodyRef} onBodyInput={setSendBodyHtml} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Hủy</Button>
            <Button variant="destructive" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("reject")}>
              {actionMutation.isPending ? "Đang lưu..." : "Từ chối"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Xác nhận đã ký ── */}
      <Dialog open={actionDialog === "sign"} onOpenChange={(v) => !v && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Xác nhận khách đã ký hợp đồng</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Ngày ký <span className="text-destructive">*</span></Label>
              <Input type="date" value={signingDate} onChange={(e) => setSigningDate(e.target.value)} />
            </div>
            <RichNoteEditor title={signTitle} onTitleChange={setSignTitle} bodyRef={signBodyRef} onBodyInput={setSignBodyHtml} />
            <PhaseAttachmentPicker
              required
              file={actionAttachmentFile}
              fileType={actionAttachmentType}
              onFileChange={setActionAttachmentFile}
              onFileTypeChange={setActionAttachmentType}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Hủy</Button>
            <Button disabled={!signingDate || !actionAttachmentFile || actionMutation.isPending} onClick={() => actionMutation.mutate("sign")}>
              {actionMutation.isPending ? "Đang lưu..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Xác nhận tạm ứng ── */}
      <Dialog open={actionDialog === "confirm_advance"} onOpenChange={(v) => !v && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Xác nhận nhận tạm ứng</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Số tiền tạm ứng <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Ngày nhận <span className="text-destructive">*</span></Label>
              <Input type="datetime-local" value={advancePaidAt} onChange={(e) => setAdvancePaidAt(e.target.value)} />
            </div>
            <RichNoteEditor title={advanceTitle} onTitleChange={setAdvanceTitle} bodyRef={advanceBodyRef} onBodyInput={setAdvanceBodyHtml} />
            <PhaseAttachmentPicker
              file={actionAttachmentFile}
              fileType={actionAttachmentType}
              onFileChange={setActionAttachmentFile}
              onFileTypeChange={setActionAttachmentType}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Hủy</Button>
            <Button disabled={!advanceAmount || !advancePaidAt || actionMutation.isPending} onClick={() => actionMutation.mutate("confirm_advance")}>
              {actionMutation.isPending ? "Đang lưu..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Bắt đầu sản xuất ── */}
      <Dialog open={actionDialog === "start_production"} onOpenChange={(v) => !v && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Chuyển sang giai đoạn sản xuất</DialogTitle></DialogHeader>
          <RichNoteEditor title={startTitle} onTitleChange={setStartTitle} bodyRef={startBodyRef} onBodyInput={setStartBodyHtml} />
          <PhaseAttachmentPicker
            file={actionAttachmentFile}
            fileType={actionAttachmentType}
            onFileChange={setActionAttachmentFile}
            onFileTypeChange={setActionAttachmentType}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Hủy</Button>
            <Button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("start_production")}>
              {actionMutation.isPending ? "Đang lưu..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Hoàn thành ── */}
      <Dialog open={actionDialog === "complete"} onOpenChange={(v) => !v && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hoàn thành hợp đồng</DialogTitle></DialogHeader>
          <RichNoteEditor title={completeTitle} onTitleChange={setCompleteTitle} bodyRef={completeBodyRef} onBodyInput={setCompleteBodyHtml} />
          <PhaseAttachmentPicker
            file={actionAttachmentFile}
            fileType={actionAttachmentType}
            onFileChange={setActionAttachmentFile}
            onFileTypeChange={setActionAttachmentType}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Hủy</Button>
            <Button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate("complete")}>
              {actionMutation.isPending ? "Đang lưu..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image preview */}
      <Dialog open={!!imagePreview} onOpenChange={(v) => !v && setImagePreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{imagePreview?.name}</DialogTitle></DialogHeader>
          {imagePreview && (
            <img src={imagePreview.url} alt={imagePreview.name} className="mx-auto max-h-[70vh] w-full object-contain" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImagePreview(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Documents section — full attachment list with icons
// ---------------------------------------------------------------------------

function DocumentsSection({
  attachments,
  canUpdate,
  onView,
  onDelete,
  onUpload,
}: {
  attachments: ContractAttachmentPublic[]
  canUpdate: boolean
  onView: (att: ContractAttachmentPublic) => void
  onDelete: (id: string) => void
  onUpload: (file: File) => void
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Tài liệu đính kèm ({attachments.length})
        </h2>
        {canUpdate && (
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" asChild>
              <span><Paperclip className="w-3.5 h-3.5 mr-1" />Thêm file</span>
            </Button>
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
          </label>
        )}
      </div>
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có tài liệu nào</p>
      ) : (
        <ul className="divide-y">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center gap-3 py-2.5">
              <FileTypeIcon fileName={att.file_name} />
              <button
                type="button"
                className="flex-1 min-w-0 text-left"
                onClick={() => onView(att)}
              >
                <p className="text-sm font-medium truncate hover:underline text-blue-600">{att.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {att.phase ? (CONTRACT_STATUS_LABELS[att.phase as ContractStatus] ?? att.phase) : "Tài liệu chung"}
                  {" · "}
                  {new Date(att.uploaded_at).toLocaleDateString("vi-VN")}
                </p>
              </button>
              {canUpdate && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => onDelete(att.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Next Steps Guide — context-aware guidance per workflow status
// ---------------------------------------------------------------------------

type Step = { label: string; detail?: string; urgent?: boolean }

const NEXT_STEPS: Record<ContractStatus, { title: string; color: string; steps: Step[] }> = {
  draft: {
    title: "Hợp đồng đang ở bản nháp",
    color: "border-gray-200 bg-gray-50",
    steps: [
      { label: "Kiểm tra lại nội dung hợp đồng và giá trị" },
      { label: "Đính kèm file bản vẽ thiết kế kèm theo hợp đồng (nếu có)" },
      { label: 'Bấm "Nộp BGĐ duyệt" khi đã sẵn sàng', urgent: true },
    ],
  },
  pending_approval: {
    title: "Chờ BGĐ duyệt hợp đồng",
    color: "border-amber-200 bg-amber-50",
    steps: [
      { label: "BGĐ kiểm tra nội dung hợp đồng, giá trị và các điều khoản" },
      { label: 'BGĐ bấm "Duyệt & Gửi khách hàng" nếu hợp đồng đã đúng', urgent: true },
      { label: 'Hoặc bấm "Từ chối" để trả về bản nháp và yêu cầu chỉnh sửa' },
    ],
  },
  sent: {
    title: "Đã gửi hợp đồng — chờ khách hàng ký",
    color: "border-blue-200 bg-blue-50",
    steps: [
      { label: "Theo dõi phản hồi của khách hàng về hợp đồng" },
      { label: "Khi khách hàng đồng ý ký: chuẩn bị file hợp đồng có chữ ký scan/PDF" },
      { label: 'Bấm "Xác nhận đã ký" và đính kèm file bằng chứng', urgent: true },
    ],
  },
  signed: {
    title: "Hợp đồng đã ký — chờ nhận tạm ứng",
    color: "border-purple-200 bg-purple-50",
    steps: [
      { label: "Theo dõi thanh toán tạm ứng đợt 1 theo điều khoản hợp đồng" },
      { label: "Khi nhận được tiền: ghi nhận số tiền và ngày nhận thực tế" },
      { label: 'Bấm "Xác nhận nhận tạm ứng" để chốt và bắt đầu chuẩn bị sản xuất', urgent: true },
    ],
  },
  advance_received: {
    title: "Đã nhận tạm ứng — chuẩn bị triển khai sản xuất",
    color: "border-amber-200 bg-amber-50",
    steps: [
      {
        label: "Phòng Kỹ thuật: Hiệu chỉnh bản vẽ theo các điều chỉnh phát sinh khi thương lượng, phát hành bản vẽ chi tiết cho từng tổ sản xuất",
        detail: "Đảm bảo bản vẽ đã được BGĐ phê duyệt trước khi phát hành",
      },
      {
        label: "Phòng Kế hoạch: Lên lịch sản xuất cho từng tổ, phân bổ nhân sự và thời gian",
        detail: "Xác định thứ tự thi công — một số công việc phụ thuộc vào việc hoàn thành trước",
      },
      {
        label: "Phòng Vật tư: Đặt hàng vật tư thiết bị theo bản vẽ đã phê duyệt",
        detail: "Khảo sát ≥3 nhà cung cấp, trình BGĐ phê duyệt trước khi đặt hàng. Chuyển đơn đặt hàng cho Kế toán thanh toán",
      },
      {
        label: "Tạo task chi tiết cho từng tổ trong dự án liên kết để theo dõi tiến độ",
        detail: "Các task cần thể hiện thứ tự phụ thuộc: vật tư về mới sản xuất được, sản xuất xong mới lắp đặt được",
        urgent: true,
      },
      {
        label: 'Khi đã phân công xong cho tất cả bộ phận: bấm "Bắt đầu sản xuất"',
        urgent: true,
      },
    ],
  },
  in_production: {
    title: "Đang trong giai đoạn sản xuất & lắp đặt",
    color: "border-orange-200 bg-orange-50",
    steps: [
      { label: "Theo dõi tiến độ các tổ sản xuất qua dự án liên kết" },
      { label: "Phòng Cung ứng: Khi thiết bị hoàn thành tại xưởng, lên kế hoạch vận chuyển đến công trình" },
      { label: "Nhóm lắp đặt tại công trình: thi công theo thứ tự — điện → hàn đường ống → lắp đặt thiết bị → bọc cách nhiệt" },
      { label: 'Khi toàn bộ sản xuất + lắp đặt hoàn tất và nghiệm thu: bấm "Hoàn thành hợp đồng"', urgent: true },
    ],
  },
  completed: {
    title: "Hoàn thành",
    color: "border-green-200 bg-green-50",
    steps: [],
  },
}

function NextStepsGuide({
  status,
  projectId,
}: {
  status: ContractStatus
  projectId: string | null
}) {
  const config = NEXT_STEPS[status]
  if (!config.steps.length) return null

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${config.color}`}>
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-muted-foreground shrink-0" />
        <h2 className="font-semibold text-sm">{config.title}</h2>
      </div>
      <ol className="space-y-2.5">
        {config.steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${step.urgent ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"}`}>
              {i + 1}
            </span>
            <div className="space-y-0.5">
              <p className={`text-sm ${step.urgent ? "font-medium" : ""}`}>{step.label}</p>
              {step.detail && (
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {projectId && (status === "advance_received" || status === "in_production") && (
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Xem dự án liên kết để quản lý task chi tiết
        </Link>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusStepper({
  currentStatus,
  selectedStatus,
  onStepClick,
}: {
  currentStatus: ContractStatus
  selectedStatus: ContractStatus | null
  onStepClick: (status: ContractStatus | null) => void
}) {
  const currentIdx = CONTRACT_STATUS_ORDER.indexOf(currentStatus)
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {CONTRACT_STATUS_ORDER.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const selected = selectedStatus === s
        return (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onStepClick(selected ? null : s)}
              className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                selected
                  ? "ring-2 ring-primary/40 bg-primary/10 text-primary"
                  : done
                    ? "bg-green-100 text-green-700"
                    : active
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-400"
              }`}
            >
              {done && <CheckCircle2 className="w-3 h-3 inline mr-0.5" />}
              {CONTRACT_STATUS_LABELS[s]}
            </button>
            {i < CONTRACT_STATUS_ORDER.length - 1 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
          </div>
        )
      })}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-xs">{value}</span>
    </div>
  )
}

function RichNoteEditor({
  title, onTitleChange, bodyRef, onBodyInput,
}: {
  title: string
  onTitleChange: (v: string) => void
  bodyRef: React.RefObject<HTMLDivElement | null>
  onBodyInput: (html: string) => void
}) {
  function applyCommand(command: string, value?: string) {
    const editor = bodyRef.current
    if (!editor) return
    editor.focus()
    document.execCommand(command, false, value)
    onBodyInput(editor.innerHTML)
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Tiêu đề ghi chú</Label>
        <Input placeholder="Ví dụ: Biên bản xác nhận..." value={title} onChange={(e) => onTitleChange(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Nội dung</Label>
        <div className="flex flex-wrap gap-1 rounded-t-md border border-b-0 bg-muted/20 px-1 py-1">
          <ToolbarBtn onClick={() => applyCommand("bold")}><b>B</b></ToolbarBtn>
          <ToolbarBtn onClick={() => applyCommand("italic")}><i>I</i></ToolbarBtn>
          <ToolbarBtn onClick={() => applyCommand("underline")}><u>U</u></ToolbarBtn>
          <ToolbarBtn onClick={() => applyCommand("formatBlock", "h2")}>H2</ToolbarBtn>
          <ToolbarBtn onClick={() => applyCommand("insertUnorderedList")}>• List</ToolbarBtn>
          <ToolbarBtn onClick={() => applyCommand("insertOrderedList")}>1. List</ToolbarBtn>
        </div>
        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-[100px] rounded-b-md border bg-background px-3 py-2 text-sm focus:outline-none"
          onInput={(e) => onBodyInput(e.currentTarget.innerHTML)}
        />
      </div>
    </div>
  )
}

function ToolbarBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      className="rounded px-2 py-0.5 text-xs hover:bg-muted font-medium"
    >
      {children}
    </button>
  )
}

function PhaseAttachmentPicker({
  required = false,
  file,
  fileType,
  onFileChange,
  onFileTypeChange,
}: {
  required?: boolean
  file: File | null
  fileType: string
  onFileChange: (file: File | null) => void
  onFileTypeChange: (fileType: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label>
        Tài liệu cho bước này {required ? <span className="text-destructive">*</span> : null}
      </Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          type="file"
          onChange={(eventValue) => onFileChange(eventValue.target.files?.[0] ?? null)}
        />
        <select
          title="Loại file"
          value={fileType}
          onChange={(eventValue) => onFileTypeChange(eventValue.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-44"
        >
          <option value="contract_pdf">Hợp đồng PDF</option>
          <option value="drawing">Bản vẽ</option>
          <option value="document">Tài liệu</option>
        </select>
      </div>
      {file ? (
        <p className="text-xs text-muted-foreground">Đã chọn: {file.name}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {required ? "Bắt buộc có file cho bước này." : "Có thể đính kèm nếu có chứng từ/bằng chứng."}
        </p>
      )}
    </div>
  )
}

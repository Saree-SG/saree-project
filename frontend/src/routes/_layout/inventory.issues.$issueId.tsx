import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { ArrowLeft, ChevronRight, Loader2, Info, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getIssue, approveIssue, executeIssue, uploadIssueAttachment } from "@/modules/inventory/inventoryApi"
import { ISSUE_STATUS_LABELS, type IssueStatus } from "@/modules/inventory/inventoryTypes"

export const Route = createFileRoute("/_layout/inventory/issues/$issueId")({
  component: IssueDetailPage,
})

const ISSUE_STATUS_COLORS: Record<IssueStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  issued: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
}

const ISSUE_STATUS_ORDER: IssueStatus[] = ["pending", "approved", "issued"]

function IssueDetailPage() {
  const { issueId } = Route.useParams()
  const qc = useQueryClient()
  const [executeTitle, setExecuteTitle] = useState("")
  const [executeBody, setExecuteBody] = useState("")
  const [executeNotes, setExecuteNotes] = useState("")
  const [executeFiles, setExecuteFiles] = useState<File[]>([])

  const { data: issue, isLoading } = useQuery({
    queryKey: ["inventory-issue", issueId],
    queryFn: () => getIssue(issueId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inventory-issue", issueId] })
    qc.invalidateQueries({ queryKey: ["inventory-issues"] })
    qc.invalidateQueries({ queryKey: ["inventory-items"] })
    qc.invalidateQueries({ queryKey: ["inventory-alerts"] })
  }

  const approveMut = useMutation({
    mutationFn: (body: { action: "approve" | "reject"; note?: string }) =>
      approveIssue(issueId, body),
    onSuccess: invalidate,
  })

  const executeMut = useMutation({
    mutationFn: async () => {
      if (executeFiles.length > 0) {
        for (const file of executeFiles) {
          await uploadIssueAttachment(issueId, file, "document")
        }
      }
      const fileNames = executeFiles.map((f) => f.name).join(", ")
      const parts = [
        executeTitle.trim() ? `Tiêu đề: ${executeTitle.trim()}` : "",
        executeBody.trim() ? `Nội dung: ${executeBody.trim()}` : "",
        executeNotes.trim() ? `Ghi chú: ${executeNotes.trim()}` : "",
        fileNames ? `Tệp đính kèm: ${fileNames}` : "",
      ].filter(Boolean)
      const mergedNotes = parts.join("\n")
      return await executeIssue(issueId, { notes: mergedNotes || undefined })
    },
    onSuccess: () => {
      setExecuteTitle("")
      setExecuteBody("")
      setExecuteNotes("")
      setExecuteFiles([])
      invalidate()
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  }
  if (!issue) return null

  const currentIdx = ISSUE_STATUS_ORDER.indexOf(issue.status)

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/inventory" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Kho hàng
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-mono">{issue.issue_number}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{issue.issue_number}</h1>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${ISSUE_STATUS_COLORS[issue.status]}`}>
            {ISSUE_STATUS_LABELS[issue.status]}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {issue.status === "pending" && (
            <>
              <Button
                size="sm"
                disabled={approveMut.isPending}
                onClick={() => approveMut.mutate({ action: "approve" })}
              >
                {approveMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Duyệt
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={approveMut.isPending}
                onClick={() => approveMut.mutate({ action: "reject" })}
              >
                Từ chối
              </Button>
            </>
          )}
          {issue.status === "approved" && (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm">Xuất kho</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Xác nhận xuất kho</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  Thao tác này sẽ trừ số lượng tương ứng khỏi tồn kho và không thể hoàn tác.
                </p>
                <div>
                  <Label>Tiêu đề</Label>
                  <Input
                    value={executeTitle}
                    onChange={(e) => setExecuteTitle(e.target.value)}
                    placeholder="VD: Xuất kho đợt 1 cho công trình A"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1">
                    <Label>Nội dung</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Hướng dẫn nội dung xác nhận xuất kho"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Mô tả lý do xuất kho, phạm vi sử dụng, người nhận, hoặc ghi chú vận chuyển.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Textarea
                    value={executeBody}
                    onChange={(e) => setExecuteBody(e.target.value)}
                    rows={3}
                    placeholder="Nhập nội dung xác nhận xuất kho..."
                  />
                </div>
                <div>
                  <Label>Ghi chú</Label>
                  <Textarea
                    value={executeNotes}
                    onChange={(e) => setExecuteNotes(e.target.value)}
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Import file</Label>
                  <Input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      setExecuteFiles(files)
                    }}
                  />
                  {executeFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {executeFiles.map((file) => (
                        <p key={file.name} className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" />
                          {file.name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    disabled={executeMut.isPending}
                    onClick={() => executeMut.mutate()}
                  >
                    {executeMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                    Xác nhận xuất kho
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Status stepper */}
      <div className="flex items-center gap-1">
        {ISSUE_STATUS_ORDER.map((s, idx) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                idx < currentIdx
                  ? "bg-green-100 text-green-800"
                  : idx === currentIdx
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {ISSUE_STATUS_LABELS[s]}
            </div>
            {idx < ISSUE_STATUS_ORDER.length - 1 && (
              <ChevronRight className="w-3 h-3 text-gray-300" />
            )}
          </div>
        ))}
      </div>

      {/* Link to task */}
      {issue.task_id && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-2 text-sm">
          <span>🔗</span>
          <span className="text-blue-800">Phiếu này được tạo từ công việc:</span>
          <Link
            to="/tasks/$taskId"
            params={{ taskId: issue.task_id }}
            className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            Xem task →
          </Link>
        </div>
      )}

      {/* Items */}
      <div>
        <h2 className="font-semibold mb-3">Danh sách vật tư xuất ({issue.items.length})</h2>
        {issue.items.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
            Chưa có vật tư nào. Vào trang kho hàng để thêm vật tư vào phiếu này.
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">Tên vật tư</th>
                  <th className="text-left p-3 font-medium">Mã / ĐVT</th>
                  <th className="text-right p-3 font-medium">Tồn kho</th>
                  <th className="text-right p-3 font-medium">SL yêu cầu</th>
                  <th className="text-right p-3 font-medium">SL thực xuất</th>
                </tr>
              </thead>
              <tbody>
                {issue.items.map((item, idx) => {
                  const currentStock = item.current_stock != null ? Number(item.current_stock) : null
                  const requestedQty = Number(item.quantity_requested)
                  const isLow =
                    currentStock != null &&
                    !Number.isNaN(currentStock) &&
                    !Number.isNaN(requestedQty) &&
                    currentStock < requestedQty
                  return (
                    <tr key={item.id} className={`border-t ${isLow && issue.status !== "issued" ? "bg-red-50" : ""}`}>
                      <td className="p-3 text-muted-foreground">{idx + 1}</td>
                      <td className="p-3 font-medium">
                        {item.item_name ?? <span className="font-mono text-xs text-muted-foreground">{item.inventory_item_id.slice(0, 8)}…</span>}
                        {isLow && issue.status !== "issued" && (
                          <span className="ml-2 text-xs font-semibold text-red-600">⚠ Không đủ tồn</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {item.item_code && <span className="font-mono mr-1">{item.item_code}</span>}
                        {item.unit && <span>{item.unit}</span>}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {currentStock != null ? currentStock : "—"}
                      </td>
                      <td className="p-3 text-right">{requestedQty}</td>
                      <td className="p-3 text-right">
                        {item.quantity_issued != null ? (
                          <span className="font-medium text-green-700">{Number(item.quantity_issued)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {issue.notes && (
        <div className="border rounded-lg p-4 bg-muted/20">
          <p className="text-sm font-medium mb-1">Ghi chú</p>
          <p className="text-sm text-muted-foreground">{issue.notes}</p>
        </div>
      )}

      {issue.attachments?.length > 0 && (
        <div className="border rounded-lg p-4 bg-muted/20">
          <p className="text-sm font-medium mb-2">Tệp đính kèm ({issue.attachments.length})</p>
          <div className="space-y-2">
            {issue.attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.file_url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-blue-700 underline underline-offset-2 hover:text-blue-900"
              >
                {attachment.file_name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"

import { OpenAPI } from "@/client"
import { getAccessToken } from "@/modules/auth/tokenStore"

export const Route = createFileRoute("/_layout/material-requests/$requestId")({
  component: MaterialRequestDetailPage,
})

type MaterialRequestPublic = {
  id: string
  item_name: string
  quantity: number
  unit: string
  reason: string
  status: string
  created_at: string
  materials_note?: string | null
  director_note?: string | null
  attachments?: Array<{ id: string; filename: string; file_url: string }>
}

const STATUS_LABELS: Record<string, string> = {
  pending_materials: "Chờ vật tư duyệt",
  pending_director: "Chờ GĐ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
}

function authHeaders() {
  return { Authorization: `Bearer ${getAccessToken() || ""}` }
}

function MaterialRequestDetailPage() {
  const { requestId } = Route.useParams()

  const query = useQuery({
    queryKey: ["material-request", requestId],
    queryFn: async () => {
      const res = await axios.get<MaterialRequestPublic>(
        `${OpenAPI.BASE}/api/v1/material-requests/${requestId}`,
        { headers: authHeaders() },
      )
      return res.data
    },
  })

  const req = query.data

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-2 pb-24 pt-3 sm:px-4">
      <Link to="/material-requests" className="text-xs text-muted-foreground hover:underline">
        ← Danh sách yêu cầu vật tư
      </Link>

      {query.isLoading && (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      )}

      {req && (
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-extrabold">{req.item_name}</h1>
            <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
              {STATUS_LABELS[req.status] ?? req.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Số lượng</p>
              <p className="font-semibold">{req.quantity} {req.unit}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ngày tạo</p>
              <p className="font-semibold">{new Date(req.created_at).toLocaleDateString("vi-VN")}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Lý do</p>
            <p className="text-sm">{req.reason}</p>
          </div>
          {req.materials_note && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              <p className="text-xs font-semibold mb-1">Ghi chú phòng vật tư</p>
              <p>{req.materials_note}</p>
            </div>
          )}
          {req.director_note && (
            <div className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800">
              <p className="text-xs font-semibold mb-1">Ghi chú giám đốc</p>
              <p>{req.director_note}</p>
            </div>
          )}
          {(req.attachments?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Tệp đính kèm</p>
              <div className="space-y-1">
                {req.attachments!.map((att) => (
                  <a
                    key={att.id}
                    href={att.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-muted/30"
                  >
                    📎 {att.filename}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

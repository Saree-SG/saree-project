import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Award, Download, Trophy } from "lucide-react"
import { useState } from "react"

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type YearSummaryRow,
  getYearSummary,
} from "@/modules/dashboard/yearSummaryApi"

export const Route = createFileRoute("/_layout/year-summary")({
  component: YearSummaryPage,
  head: () => ({ meta: [{ title: "Năng suất năm" }] }),
})

const COLUMNS: { key: string; label: string }[] = [
  { key: "rank", label: "Hạng" },
  { key: "user_name", label: "Nhân sự" },
  { key: "job_title", label: "Chức danh" },
  { key: "score", label: "Điểm tổng hợp" },
  { key: "tasks_done", label: "Task hoàn thành" },
  { key: "tasks_total", label: "Tổng task" },
  { key: "completion_pct", label: "% Hoàn thành" },
  { key: "on_time_pct", label: "% Đúng hạn" },
  { key: "tasks_overdue", label: "Task trễ" },
  { key: "work_hours", label: "Giờ công" },
  { key: "days_worked", label: "Ngày công" },
  { key: "attendance_pct", label: "% Chuyên cần" },
  { key: "proofs_approved", label: "Bằng chứng duyệt" },
  { key: "quality_pct", label: "% Chất lượng" },
]

/** Export rows to an Excel-compatible .xls file (HTML table, UTF-8). */
function exportExcel(rows: YearSummaryRow[], periodLabel: string) {
  const headerHtml = COLUMNS.map((c) => `<th>${c.label}</th>`).join("")
  const bodyHtml = rows
    .map(
      (r) =>
        `<tr>${COLUMNS.map((c) => {
          const raw = (r as Record<string, unknown>)[c.key]
          return `<td>${raw == null ? "" : String(raw)}</td>`
        }).join("")}</tr>`,
    )
    .join("")
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8" /></head><body>` +
    `<table border="1"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>` +
    `</body></html>`
  const blob = new Blob(["﻿", html], {
    type: "application/vnd.ms-excel;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `nang-suat-${periodLabel}.xls`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function YearSummaryPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear())

  const query = useQuery({
    queryKey: ["year-summary", year],
    queryFn: () => getYearSummary({ year }),
  })

  const data = query.data
  const rows = data?.rows ?? []
  const periodLabel = data ? `${data.from}_${data.to}` : String(year)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Trophy className="text-primary size-6" /> Năng suất năm
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tổng hợp cả năm theo nhân sự — cơ sở xét thưởng cuối năm.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">Năm</label>
            <Input
              type="number"
              value={year}
              min={2020}
              max={2100}
              onChange={(e) =>
                setYear(parseInt(e.target.value, 10) || new Date().getFullYear())
              }
              className="w-28"
            />
          </div>
          <Button
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => exportExcel(rows, periodLabel)}
          >
            <Download className="mr-1 size-4" /> Xuất Excel
          </Button>
        </div>
      </div>

      {data?.weights ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Award className="size-4" /> Công thức điểm:
            </span>
            <span>Hoàn thành {Math.round(data.weights.completion * 100)}%</span>
            <span>· Đúng hạn {Math.round(data.weights.on_time * 100)}%</span>
            <span>· Chuyên cần {Math.round(data.weights.attendance * 100)}%</span>
            <span>· Chất lượng {Math.round(data.weights.quality * 100)}%</span>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bảng xếp hạng năng suất</CardTitle>
          <CardDescription>
            {data ? `Từ ${data.from} đến ${data.to}` : `Năm ${year}`} ·{" "}
            {rows.length} người
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {query.isLoading ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Đang tải…</p>
          ) : query.isError ? (
            <p className="text-destructive py-6 text-center text-sm">
              Không tải được dữ liệu (cần quyền xem báo cáo).
            </p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Chưa có dữ liệu trong năm này.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead>Nhân sự</TableHead>
                  <TableHead className="text-right">Điểm</TableHead>
                  <TableHead className="text-right">Task HT</TableHead>
                  <TableHead className="text-right">% HT</TableHead>
                  <TableHead className="text-right">% Đúng hạn</TableHead>
                  <TableHead className="text-right text-red-500">Trễ</TableHead>
                  <TableHead className="text-right">Giờ công</TableHead>
                  <TableHead className="text-right">Ngày</TableHead>
                  <TableHead className="text-right">% Chất lượng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="text-right font-semibold">
                      {r.rank}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.user_name}
                      {r.job_title ? (
                        <span className="block text-xs text-muted-foreground">
                          {r.job_title}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {r.score}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.tasks_done}/{r.tasks_total}
                    </TableCell>
                    <TableCell className="text-right">{r.completion_pct}%</TableCell>
                    <TableCell className="text-right">{r.on_time_pct}%</TableCell>
                    <TableCell className="text-right text-red-500">
                      {r.tasks_overdue || ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.work_hours.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right">{r.days_worked}</TableCell>
                    <TableCell className="text-right">
                      {r.quality_pct != null ? `${r.quality_pct}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

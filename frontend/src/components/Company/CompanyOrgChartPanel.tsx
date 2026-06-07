import { useQuery } from "@tanstack/react-query"
import { Download } from "lucide-react"
import { useRef, useState } from "react"

import OrgChart from "@/components/Admin/Organization/OrgChart"
import { Button } from "@/components/ui/button"
import useCustomToast from "@/hooks/useCustomToast"
import { getOrgTree } from "@/modules/org/orgTreeApi"

/**
 * Company detail org chart — the same graphical chart used on the admin
 * Organization screen, scoped to a single company with PNG export.
 */
export default function CompanyOrgChartPanel({
  companyId,
}: {
  companyId: string | null
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const {
    data: tree,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["roles", "org-tree", companyId],
    queryFn: () => getOrgTree({ companyId: companyId as string }),
    enabled: Boolean(companyId),
  })

  const exportPng = async () => {
    if (!chartRef.current) return
    setExporting(true)
    try {
      const { toPng } = await import("html-to-image")
      const dataUrl = await toPng(chartRef.current, {
        cacheBust: true,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      })
      const link = document.createElement("a")
      link.download = "org-chart.png"
      link.href = dataUrl
      link.click()
      showSuccessToast("Đã tải file PNG")
    } catch (err) {
      showErrorToast("Xuất PNG thất bại")
      console.error(err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Sơ đồ tổ chức</h3>
          <p className="text-muted-foreground text-sm">
            Cây vị trí theo phòng ban và vai trò.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!tree || exporting}
          onClick={exportPng}
        >
          <Download className="mr-1 h-4 w-4" />
          {exporting ? "Đang xuất..." : "Xuất PNG"}
        </Button>
      </div>

      {!companyId ? (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          Chọn công ty để xem sơ đồ.
        </div>
      ) : isLoading ? (
        <div className="rounded-md border p-10 text-center text-muted-foreground">
          Đang tải sơ đồ...
        </div>
      ) : error || !tree ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Không tải được sơ đồ tổ chức.
        </div>
      ) : tree.departments.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          Công ty này chưa có phòng ban hoặc thành viên.
        </div>
      ) : (
        <OrgChart ref={chartRef} data={tree} />
      )}
    </div>
  )
}

import { createFileRoute } from "@tanstack/react-router"

import { DetailProvider } from "@/components/demo/detail"
import { LiveKpi } from "@/components/demo/live"

export const Route = createFileRoute("/_layout/kpi")({
  component: KpiPage,
  head: () => ({ meta: [{ title: "KPI đội nhóm" }] }),
})

function KpiPage() {
  return (
    <DetailProvider>
      <div className="mx-auto w-full max-w-lg px-2 pb-10 pt-4 md:max-w-6xl md:px-4">
        <LiveKpi />
      </div>
    </DetailProvider>
  )
}

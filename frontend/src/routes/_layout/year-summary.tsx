import { createFileRoute } from "@tanstack/react-router"

import YearSummaryPanel from "@/components/Company/YearSummaryPanel"

export const Route = createFileRoute("/_layout/year-summary")({
  component: YearSummaryPage,
  head: () => ({ meta: [{ title: "Năng suất năm" }] }),
})

function YearSummaryPage() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4 pb-10">
      <YearSummaryPanel />
    </div>
  )
}

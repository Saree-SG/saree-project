import { createFileRoute } from "@tanstack/react-router"

import ProductivityPanel from "@/components/Company/ProductivityPanel"

export const Route = createFileRoute("/_layout/productivity")({
  component: ProductivityPage,
  head: () => ({ meta: [{ title: "Năng suất tổ" }] }),
})

function ProductivityPage() {
  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-10">
      <ProductivityPanel />
    </div>
  )
}

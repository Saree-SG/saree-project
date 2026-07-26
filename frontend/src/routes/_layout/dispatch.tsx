import { createFileRoute } from "@tanstack/react-router"

import { DetailProvider } from "@/components/demo/detail"
import { LiveDispatch } from "@/components/demo/live"

export const Route = createFileRoute("/_layout/dispatch")({
  component: DispatchPage,
  head: () => ({ meta: [{ title: "Điều phối nhân sự" }] }),
})

function DispatchPage() {
  return (
    <DetailProvider>
      <div className="mx-auto w-full max-w-lg px-2 pb-10 pt-4 md:max-w-6xl md:px-4">
        <LiveDispatch />
      </div>
    </DetailProvider>
  )
}

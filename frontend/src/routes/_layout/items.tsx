import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/items")({
  component: Items,
  head: () => ({
    meta: [
      {
        title: "Items - FastAPI Template",
      },
    ],
  }),
})

function Items() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <h1 className="text-2xl font-bold tracking-tight">
        Items Module Removed
      </h1>
      <p className="mt-2 text-muted-foreground">
        The legacy Items module was removed from backend and frontend.
      </p>
    </div>
  )
}

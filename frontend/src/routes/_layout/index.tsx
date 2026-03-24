import { createFileRoute } from "@tanstack/react-router"

import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Dashboard - FastAPI Template",
      },
    ],
  }),
})

function Dashboard() {
  const { user: currentUser, logout } = useAuth()

  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p
            className="text-muted-foreground"
            data-testid="dashboard-auth-message"
          >
            Logged in as {currentUser?.email}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
          onClick={() => {
            void logout()
          }}
        >
          Logout
        </button>
      </div>
    </div>
  )
}

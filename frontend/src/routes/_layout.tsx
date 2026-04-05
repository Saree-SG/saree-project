import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router"

import { Footer } from "@/components/Common/Footer"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { isLoggedIn } from "@/hooks/useAuth"
import useRefreshState from "@/hooks/useRefreshState"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
})

function Layout() {
  const isRefreshing = useRefreshState()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isChatRoute = pathname.startsWith("/chat")

  if (isChatRoute) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <main className="h-dvh w-full overflow-hidden">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          {isRefreshing ? (
            <p className="ml-auto text-xs text-muted-foreground">
              Re-authenticating session...
            </p>
          ) : null}
        </header>
        <main className="flex-1 p-6 md:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
        <Footer />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Layout

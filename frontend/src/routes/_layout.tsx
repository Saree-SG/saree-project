import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router"

import { Footer } from "@/components/Common/Footer"
import { MobileAppHeader } from "@/components/Layout/MobileAppHeader"
import { MobileBottomNav } from "@/components/Layout/MobileBottomNav"
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
        <SidebarInset className="flex min-h-svh flex-col">
          <MobileAppHeader />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden pt-[calc(3.5rem+env(safe-area-inset-top,0px))] pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:h-dvh md:min-h-0 md:pt-0 md:pb-0">
            <Outlet />
          </main>
          <MobileBottomNav />
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex min-h-svh flex-col">
        <MobileAppHeader />
        <header className="sticky top-0 z-10 hidden h-16 shrink-0 items-center gap-2 border-b px-4 md:flex">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          {isRefreshing ? (
            <p className="ml-auto text-xs text-muted-foreground">
              Re-authenticating session...
            </p>
          ) : null}
        </header>
        <div className="flex min-h-0 flex-1 flex-col pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-0">
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:px-8 md:py-8 md:pb-8">
            <Outlet />
          </main>
          <Footer />
        </div>
        <MobileBottomNav />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Layout

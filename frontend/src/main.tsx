import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { ApiError, OpenAPI } from "./client"
import { ThemeProvider } from "./components/theme-provider"
import { Toaster } from "./components/ui/sonner"
import "./index.css"
import { setupAuthInterceptor } from "./modules/auth/authInterceptor"
import { clearSession, getAccessToken } from "./modules/auth/tokenStore"
import { routeTree } from "./routeTree.gen"
import { ngrokBypassRequestHeaders, syncNgrokBypassAxiosDefaults } from "./utils/ngrokBypass"

OpenAPI.BASE = import.meta.env.VITE_API_URL
OpenAPI.TOKEN = async () => {
  return getAccessToken() || ""
}
OpenAPI.HEADERS = async () => ngrokBypassRequestHeaders(OpenAPI.BASE)
syncNgrokBypassAxiosDefaults(OpenAPI.BASE)
setupAuthInterceptor()

if (typeof window !== "undefined") {
  let lastTouchEndAt = 0

  // Prevent pinch zoom gesture on mobile browsers.
  window.addEventListener(
    "gesturestart",
    (eventValue) => {
      eventValue.preventDefault()
    },
    { passive: false },
  )

  // Prevent browser zoom from ctrl/cmd + wheel on desktop browsers.
  window.addEventListener(
    "wheel",
    (eventValue) => {
      if (eventValue.ctrlKey || eventValue.metaKey) {
        eventValue.preventDefault()
      }
    },
    { passive: false },
  )

  // Prevent double-tap zoom on mobile Safari.
  window.addEventListener(
    "touchend",
    (eventValue) => {
      const now = Date.now()
      if (now - lastTouchEndAt <= 300) {
        eventValue.preventDefault()
      }
      lastTouchEndAt = now
    },
    { passive: false },
  )
}

const handleApiError = (error: Error) => {
  if (error instanceof ApiError && error.status === 401) {
    clearSession()
    window.location.href = "/login"
  }
}
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleApiError,
  }),
  mutationCache: new MutationCache({
    onError: handleApiError,
  }),
})

const router = createRouter({ routeTree })
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors closeButton position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)

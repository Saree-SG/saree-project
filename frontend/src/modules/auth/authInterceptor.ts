import axios from "axios"
import { OpenAPI } from "@/client"
import { destroySession, refreshSession } from "./authSession"
import { setRefreshing } from "./refreshState"
import { getAccessToken, getRefreshToken } from "./tokenStore"

let refreshPromise: Promise<void> | null = null

const isAuthEndpoint = (url: string) => {
  return (
    url.includes("/api/v1/login/access-token") ||
    url.includes("/api/v1/login/refresh-token") ||
    url.includes("/api/v1/login/logout")
  )
}

const refreshWithLock = async () => {
  if (!refreshPromise) {
    setRefreshing(true)
    refreshPromise = refreshSession()
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null
        setRefreshing(false)
      })
  }
  return refreshPromise
}

export const setupAuthInterceptor = () => {
  OpenAPI.interceptors.response.use(async (response) => {
    if (response.status !== 401) {
      return response
    }

    const url = String(response.config?.url ?? "")
    if (isAuthEndpoint(url)) {
      return response
    }
    if (!getRefreshToken()) {
      return response
    }

    const config = response.config as typeof response.config & {
      __authRetry?: boolean
    }
    if (config.__authRetry) {
      return response
    }

    try {
      await refreshWithLock()
      config.__authRetry = true
      const headers = {
        ...config.headers,
        Authorization: `Bearer ${getAccessToken() || ""}`,
      }
      return await axios.request({
        ...(config as any),
        headers: headers as any,
      })
    } catch {
      await destroySession()
      return response
    }
  })
}

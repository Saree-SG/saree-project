import type { Body_login_login_access_token as AccessToken } from "@/client"
import { loginWithPassword, logoutSession, refreshToken } from "./authApi"
import { clearSession, getRefreshToken, saveSession } from "./tokenStore"

export const createSessionFromLogin = async (payload: AccessToken) => {
  const response = await loginWithPassword(payload)
  saveSession({
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    sessionId: response.session_id ?? null,
  })
  return response
}

export const refreshSession = async () => {
  const refreshTokenValue = getRefreshToken()
  if (!refreshTokenValue) {
    throw new Error("No refresh token available")
  }
  const refreshed = await refreshToken(refreshTokenValue)
  saveSession({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? refreshTokenValue,
    sessionId: refreshed.session_id ?? null,
  })
  return refreshed
}

export const destroySession = async () => {
  const refreshTokenValue = getRefreshToken()
  if (refreshTokenValue) {
    try {
      await logoutSession(refreshTokenValue)
    } catch {
      const ignored = true
      void ignored
    }
  }
  clearSession()
}

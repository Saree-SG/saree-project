import type { AuthSession } from "./types"

const ACCESS_TOKEN_KEY = "access_token"
const REFRESH_TOKEN_KEY = "refresh_token"
const SESSION_ID_KEY = "session_id"

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY)

export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)

/**
 * Returns true when a non-expired access token exists.
 *
 * This prevents "stale token" loops where we keep redirecting/triggering
 * protected calls with an already-expired token.
 */
export const isLoggedIn = () => {
  const token = getAccessToken()
  if (!token) return false
  return !isJwtExpired(token)
}

/**
 * Best-effort JWT expiry check (no signature verification on client).
 */
const isJwtExpired = (token: string) => {
  const payload = decodeJwtPayload(token)
  if (!payload) return true

  const exp = typeof payload.exp === "number" ? payload.exp : null
  if (!exp) return true

  // 30s leeway for clock skew.
  const nowSeconds = Math.floor(Date.now() / 1000)
  return exp <= nowSeconds + 30
}

/**
 * Decode JWT payload to a JSON object. Returns null if decoding fails.
 */
const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split(".")
  if (parts.length < 2) return null

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
    const json = atob(padded)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export const saveSession = (session: AuthSession) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken)
  if (session.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
  if (session.sessionId) {
    localStorage.setItem(SESSION_ID_KEY, session.sessionId)
  } else {
    localStorage.removeItem(SESSION_ID_KEY)
  }
}

export const clearSession = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(SESSION_ID_KEY)
}

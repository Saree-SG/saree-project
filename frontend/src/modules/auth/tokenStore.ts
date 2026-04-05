import type { AuthSession } from "./types"

const ACCESS_TOKEN_KEY = "access_token"
const REFRESH_TOKEN_KEY = "refresh_token"
const SESSION_ID_KEY = "session_id"

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY)

export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)

export const isLoggedIn = () => getAccessToken() !== null

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

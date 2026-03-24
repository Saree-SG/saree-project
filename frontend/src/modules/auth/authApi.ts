import {
  type Body_login_login_access_token as AccessToken,
  LoginService,
} from "@/client"

export const loginWithPassword = (payload: AccessToken) =>
  LoginService.loginAccessToken({ formData: payload })

export const recoverPassword = (email: string) =>
  LoginService.recoverPassword({ email })

export const resetPassword = (token: string, newPassword: string) =>
  LoginService.resetPassword({
    requestBody: { token, new_password: newPassword },
  })

export const refreshToken = async (refreshTokenValue: string) => {
  return LoginService.refreshAccessToken({
    requestBody: { refresh_token: refreshTokenValue },
  })
}

export const logoutSession = async (refreshTokenValue?: string | null) => {
  await LoginService.logout({
    requestBody: {
      refresh_token: refreshTokenValue ?? null,
    },
  })
}

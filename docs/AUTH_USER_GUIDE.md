# User Guide: Login & Authentication Features

## 1. What users can do
- Sign in to the system
- Keep session active using refresh token
- Sign out safely from current session
- Recover/reset password if forgotten

## 2. Login

Use your account credentials:
- Email
- Password

When login is successful, the system returns:
- `access_token` (used to call protected APIs)
- `refresh_token` (used to renew login without entering password)
- `session_id`

## 3. How session works

### Access token
- Short-lived token
- Must be sent as Bearer token in protected requests

### Refresh token
- Longer-lived token
- Used to request a new access token when access token expires

### Auto refresh behavior
- If app sends 2 refresh requests nearly at the same time (network lag), system handles this safely
- You should not be forced to re-login because of this common race condition

## 4. Logout

When user logs out:
- Current session is revoked
- Access is blocked for that session
- Optional refresh token invalidation is supported

## 5. Password recovery

Available flows:
- Request recovery email
- Reset password with reset token

Security behavior:
- Recovery endpoint does not reveal whether an email exists in the system

## 6. API endpoints (for frontend integration)
- `POST /api/v1/login/access-token`
- `POST /api/v1/login/refresh-token`
- `POST /api/v1/login/logout`
- `POST /api/v1/password-recovery/{email}`
- `POST /api/v1/reset-password/`
- `POST /api/v1/login/test-token` (token validation helper)

## 7. Frontend implementation notes
- Store access token securely in app state/storage policy approved by your team
- Use refresh token only with refresh endpoint
- On logout, clear local auth state immediately
- If refresh fails with unauthorized error, redirect to login

## 8. Error cases users may see
- Wrong email/password -> “Incorrect email or password”
- Inactive account -> “Inactive user”
- Invalid/expired token -> re-login required
- Revoked session -> re-login required

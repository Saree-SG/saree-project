# Authentication & Session Technical Documentation

## 1. Scope
This document describes backend authentication and session handling implementation:
- Login with access token + refresh token
- Session lifecycle (issue, refresh, revoke)
- Grace-period refresh rotation for concurrent requests
- Optional Redis-backed session store
- Reusable async transaction foundation (`contextvars`, UoW, decorator, repository)

## 2. Architecture

### 2.1 Main Modules
- `backend/app/core/auth/security.py`
  - JWT encode/decode helpers
  - Access/refresh token creation with claims: `sub`, `exp`, `typ`, `sid`, `jti`
- `backend/app/core/auth/session_service.py`
  - Session store and refresh rotation rules
  - Redis backend when `REDIS_URL` is configured
  - In-memory fallback for local/dev
- `backend/app/api/routes/login.py`
  - Auth endpoints (`access-token`, `refresh-token`, `logout`)
- `backend/app/api/deps.py`
  - Access token validation and session-state check

### 2.2 DB Utility Foundation
- `backend/app/core/database/context.py`: async session context via `contextvars`
- `backend/app/core/database/uow.py`: async Unit of Work (`async with`)
- `backend/app/core/database/decorators.py`: `@transactional(raise_on_error=...)`
- `backend/app/core/database/repository.py`: reusable async CRUD base repository

## 3. Token and Session Flow

### 3.1 Login
Endpoint: `POST /api/v1/login/access-token`
- Validates user credentials
- Returns:
  - `access_token`
  - `refresh_token`
  - `session_id`
  - `token_type=bearer`

### 3.2 Access Validation
Each protected route:
- Decodes JWT
- Verifies token type is `access`
- Validates session state (`revoked/expired`) via `SessionService`
- Loads current user from DB

### 3.3 Refresh Rotation
Endpoint: `POST /api/v1/login/refresh-token`
- Valid refresh token rotates to a new access+refresh pair
- Old refresh token is replaced
- Grace-period key is written (`REFRESH_GRACE_PERIOD_SECONDS`)

### 3.4 Concurrent Refresh Protection
If refresh request #2 arrives shortly after request #1:
- During grace period, request #2 receives the already-issued new tokens
- Avoids false “token theft” logout for legitimate user race conditions

### 3.5 Logout
Endpoint: `POST /api/v1/login/logout`
- Requires access token (Bearer)
- Optionally accepts `refresh_token`
- Revokes session by `sid`
- Invalidates provided refresh token hash if present

## 4. Redis Data Model

Keys:
- `sess:{sid}` -> session state (`uid`, `revoked`)
- `rt:{sha256(refresh_token)}` -> active refresh state
- `rt_grace:{sha256(old_refresh_token)}` -> one-time grace response payload

Design note:
- Payload is intentionally small (no full User object)
- Keeps Redis latency and serialization overhead low

## 5. Configuration

In `backend/app/core/config.py`:
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `REFRESH_TOKEN_EXPIRE_MINUTES`
- `REFRESH_GRACE_PERIOD_SECONDS`
- `REDIS_URL` (optional)

Dependency:
- `redis` added to backend dependencies

## 6. Security Considerations
- Access token should remain short-lived
- Refresh token rotation enforced
- Session revocation check on protected requests
- Grace period limited to short window
- For production:
  - Use strong `SECRET_KEY`
  - Use Redis with persistence strategy
  - Add rate limiting for login/refresh
  - Add device/session metadata and “logout all devices”

## 7. Extension Points
- Add per-device session records
- Add DB-backed session versioning
- Add audit events for auth actions
- Add strict replay detection outside grace window

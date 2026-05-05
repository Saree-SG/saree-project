# Plan: Web Push Notifications

## Context
Hệ thống hiện có in-app notification (polling 30-60s) và WebSocket realtime cho task events. Yêu cầu thêm **Web Push** để gửi thông báo đến điện thoại người dùng ngay cả khi không mở trình duyệt — giống như native app. Không dùng third-party (OneSignal/FCM), tự build bằng VAPID + `pywebpush`.

---

## Architecture

```
User opens app → request permission → browser creates subscription (endpoint + keys)
→ POST /api/v1/notifications/push/subscribe → lưu PushSubscription vào DB

Khi có event (task_assigned, v.v.) → service._notify() tạo Notification row
→ fire-and-forget: gửi web push đến tất cả subscription của user đó
→ Service Worker nhận push event → showNotification() trên điện thoại
```

---

## Implementation Steps

### 1. Backend — VAPID keys & config
**File:** `backend/app/core/config.py`
- Thêm 3 settings: `VAPID_PRIVATE_KEY: str | None`, `VAPID_PUBLIC_KEY: str | None`, `VAPID_SUBJECT: str` (mailto:email)
- Generate keys 1 lần bằng: `python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.private_key, v.public_key)"`

### 2. Backend — Install pywebpush
**File:** `backend/pyproject.toml`
- Thêm dependency: `"pywebpush>=2.0.0"`

### 3. Backend — PushSubscription model
**File mới:** `backend/app/models/push_subscription.py`
```python
class PushSubscription(SQLModel, table=True):
    id: uuid.UUID (primary key)
    user_id: uuid.UUID (FK → user.id, CASCADE delete, indexed)
    endpoint: str (unique per device)
    p256dh: str  # browser public key
    auth: str    # auth secret
    created_at: datetime
```
- Export từ `backend/app/models/__init__.py`

### 4. Backend — Push service
**File mới:** `backend/app/services/push_service.py`
```python
async def send_push_to_user(session, user_id, title, body, entity_type, entity_id):
    # Fetch tất cả subscriptions của user
    # Gọi webpush() cho mỗi subscription (fire-and-forget với asyncio.create_task)
    # Nếu push trả về 410 Gone → xóa subscription (device đã unsubscribe)
```
- Dùng `pywebpush.webpush()` với VAPID credentials từ settings
- Graceful: nếu VAPID keys chưa được set → skip silently

### 5. Backend — Tích hợp vào notification creation
**Files:** `backend/app/services/task_service.py`, `quotation_service.py`, `material_request_service.py`, v.v.
- Sau khi `session.add(notif)` và `flush()`, gọi `asyncio.create_task(send_push_to_user(...))`
- Không await → không block request transaction

### 6. Backend — API endpoints
**File:** `backend/app/api/routes/notifications.py`

Thêm 3 endpoints:
```
POST   /notifications/push/subscribe    → lưu/cập nhật PushSubscription
DELETE /notifications/push/unsubscribe  → xóa subscription theo endpoint
GET    /notifications/push/vapid-key    → trả về VAPID public key (để frontend dùng)
```

### 7. Backend — Alembic migration
**File mới:** `backend/alembic/versions/xxxx_add_push_subscription.py`
- Tạo table `pushsubscription`

### 8. Frontend — Service Worker
**File mới:** `frontend/public/sw.js`
```javascript
self.addEventListener('push', event => {
    const data = event.data.json()
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/assets/logo.png',
            data: { url: data.url }  // deep link
        })
    )
})
self.addEventListener('notificationclick', event => {
    event.notification.close()
    clients.openWindow(event.notification.data.url)
})
```

### 9. Frontend — manifest.json
**File mới:** `frontend/public/manifest.json`
```json
{ "name": "Saree ERP", "short_name": "Saree", "start_url": "/", "display": "standalone", "icons": [...] }
```
Thêm `<link rel="manifest" href="/manifest.json">` vào `frontend/index.html`

### 10. Frontend — Push subscription hook
**File mới:** `frontend/src/hooks/usePushNotifications.ts`
```typescript
// 1. Register service worker
// 2. Request permission
// 3. subscribe() với VAPID public key từ GET /notifications/push/vapid-key
// 4. POST subscription đến backend
// 5. Expose: { isSupported, permission, subscribe, unsubscribe }
```

### 11. Frontend — Notification API module
**File:** `frontend/src/modules/notifications/notificationApi.ts`
- Thêm `subscribePush(subscription)`, `unsubscribePush(endpoint)`, `getVapidKey()`

### 12. Frontend — UI trigger
**File:** `frontend/src/components/notifications/NotificationBell.tsx`
- Thêm nút "Bật thông báo điện thoại" khi `permission !== 'granted'`
- Gọi `subscribe()` từ hook khi user click

---

## Critical Files to Modify
| File | Change |
|------|--------|
| `backend/app/core/config.py` | Thêm VAPID_* settings |
| `backend/pyproject.toml` | Thêm pywebpush dependency |
| `backend/app/models/__init__.py` | Export PushSubscription |
| `backend/app/api/routes/notifications.py` | Thêm 3 push endpoints |
| `backend/app/api/main.py` | Đảm bảo router được include (đã có) |
| `backend/app/services/task_service.py` | Trigger push sau `_notify()` |
| `frontend/index.html` | Thêm manifest link |
| `frontend/src/components/notifications/NotificationBell.tsx` | Thêm subscribe button |
| `frontend/src/modules/notifications/notificationApi.ts` | Thêm push API functions |

## New Files
| File | Purpose |
|------|---------|
| `backend/app/models/push_subscription.py` | SQLModel table |
| `backend/app/services/push_service.py` | Web push sending logic |
| `backend/alembic/versions/xxxx_add_push_subscription.py` | DB migration |
| `frontend/public/sw.js` | Service Worker |
| `frontend/public/manifest.json` | PWA manifest |
| `frontend/src/hooks/usePushNotifications.ts` | React hook |

---

## iOS Consideration
- iOS 16.4+ yêu cầu user "Add to Home Screen" trước khi nhận push
- Thêm banner hướng dẫn khi detect iOS: `navigator.userAgent.includes('iPhone') && !window.navigator.standalone`

---

## Verification
1. Generate VAPID keys, thêm vào `.env`
2. Run `alembic upgrade head`
3. Restart backend, mở app trong Chrome trên desktop → click "Bật thông báo" → browser hỏi permission → allow
4. Kiểm tra DB: `SELECT * FROM pushsubscription;` → phải có 1 row
5. Trigger 1 event (assign task) → kiểm tra desktop notification popup hiện ra
6. Trên điện thoại Android Chrome: mở app → allow notification → assign task → notification xuất hiện trên notification tray
7. Kiểm tra `docker exec redis-local redis-cli monitor` để confirm không có lỗi Redis liên quan

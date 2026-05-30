# TC-01: Xác thực & Phân quyền (Auth & RBAC)

## Điều kiện tiên quyết
- DB test đã được setup và seed
- Backend chạy trên port 8001

---

## TC-01-01: Đăng nhập thành công

**Actor:** Bất kỳ người dùng nào  
**Steps:**
1. POST `/api/v1/login/access-token` với `username=admin@test.com`, `password=Admin@123456`

**Expected:**
- HTTP 200
- Response có `access_token`, `token_type=bearer`

---

## TC-01-02: Đăng nhập sai mật khẩu

**Steps:**
1. POST `/api/v1/login/access-token` với `password=wrong`

**Expected:**
- HTTP 400 hoặc 401
- Message chứa "Incorrect email or password"

---

## TC-01-03: Truy cập API không có token

**Steps:**
1. GET `/api/v1/users/me` không có Authorization header

**Expected:**
- HTTP 401

---

## TC-01-04: Superuser bypass quyền

**Steps:**
1. Đăng nhập với admin@test.com
2. GET `/api/v1/projects/` 

**Expected:**
- HTTP 200 — superuser không bị chặn bởi RBAC

---

## TC-01-05: User không có quyền bị từ chối

**Steps:**
1. Tạo user không có vai trò gì (hoặc vai trò không có quyền PROJECT_CREATE)
2. POST `/api/v1/projects/` với token của user đó

**Expected:**
- HTTP 403

---

## TC-01-06: Tạo và gán vai trò

**Actor:** Superuser  
**Steps:**
1. GET `/api/v1/roles/` — lấy danh sách vai trò
2. POST `/api/v1/users/` — tạo user mới với `role_id`
3. GET `/api/v1/users/{id}` — xác nhận user có đúng vai trò

**Expected:**
- User được tạo với vai trò đúng
- Quyền của user khớp với quyền của vai trò

---

## TC-01-07: Cập nhật quyền của vai trò

**Steps:**
1. GET `/api/v1/roles/{role_id}` — lấy vai trò Sales Manager
2. PATCH `/api/v1/roles/{role_id}` — thêm quyền PROJECT_VIEW
3. Đăng nhập với user Sales Manager
4. GET `/api/v1/projects/`

**Expected:**
- Sau khi thêm quyền, user Sales có thể xem dự án

---

## TC-01-08: Token hết hạn

**Steps:**
1. Dùng token đã hết hạn gửi request

**Expected:**
- HTTP 401, message chứa "expired" hoặc tương đương

---

## Checklist tổng
- [ ] TC-01-01 Login thành công
- [ ] TC-01-02 Login sai mật khẩu
- [ ] TC-01-03 Không có token
- [ ] TC-01-04 Superuser bypass
- [ ] TC-01-05 User không đủ quyền bị từ chối
- [ ] TC-01-06 Tạo & gán vai trò
- [ ] TC-01-07 Cập nhật quyền vai trò
- [ ] TC-01-08 Token hết hạn

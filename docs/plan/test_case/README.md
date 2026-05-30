# Saree ERP — Bộ Test Case Tổng hợp

**Phiên bản:** 1.0 | **Ngày tạo:** 29/05/2026  
**Mục đích:** Verify toàn bộ luồng nghiệp vụ sau khi code xong, chạy trên DB test riêng biệt.

---

## Cấu trúc bộ test case

| File | Module | Số TC |
|------|--------|-------|
| [00_TEST_DB_SETUP.md](./00_TEST_DB_SETUP.md) | Hướng dẫn setup DB test | — |
| [01_AUTH_RBAC.md](./01_AUTH_RBAC.md) | Xác thực & Phân quyền | 8 |
| [02_QUOTATION.md](./02_QUOTATION.md) | Báo giá 11 giai đoạn + Multi-approver | 21 |
| [03_PROJECT.md](./03_PROJECT.md) | Quản lý Dự án (client + internal) | 15 |
| [04_TASK_5LEVEL.md](./04_TASK_5LEVEL.md) | Cây Công việc 5 Tầng | 17 |
| [05_TASK_WORKFLOW.md](./05_TASK_WORKFLOW.md) | Trạng thái & Tiến độ Công việc | 19 |
| [06_TASK_PROFILE.md](./06_TASK_PROFILE.md) | Mẫu Công việc (Task Profile) | 17 |
| [07_CONTRACT_NOTIFICATION.md](./07_CONTRACT_NOTIFICATION.md) | Hợp đồng & Thông báo | 11 |
| [08_DELAY_DEPENDENCY.md](./08_DELAY_DEPENDENCY.md) | Số ngày trễ, Gia hạn, Phụ thuộc, Critical Path | 37 |

**Tổng: 145 test case**

---

## Thứ tự chạy test (recommended)

```
Bước 1 → Setup DB test (00_TEST_DB_SETUP.md)
Bước 2 → TC-01: Auth & RBAC (đảm bảo login, token hoạt động trước)
Bước 3 → TC-02: Quotation (tạo dữ liệu báo giá cho các bước sau)
Bước 4 → TC-03: Project (cần báo giá S9 từ bước 3)
Bước 5 → TC-04: Task 5 Level (cần project từ bước 4)
Bước 6 → TC-05: Task Workflow (cần task từ bước 5)
Bước 7 → TC-06: Task Profile (cần task tree từ bước 5)
Bước 8 → TC-07: Contract & Notification (cần báo giá S9 từ bước 3)
Bước 9 → TC-08: Delay & Dependency (cần task tree từ bước 5)
```

---

## Tài khoản test

| Email | Password | Vai trò |
|-------|----------|---------|
| admin@test.com | Admin@123456 | Superuser |
| director@test.com | Test@123456 | Director |
| sales@test.com | Test@123456 | Sales Manager |
| pm@test.com | Test@123456 | Project Manager |
| tech@test.com | Test@123456 | Technician |
| accountant@test.com | Test@123456 | Accountant |

---

## Quy ước đánh dấu kết quả

Khi test xong, cập nhật checkbox trong từng file:

```markdown
- [x] TC-xx-xx Tên test case    ← PASS
- [ ] TC-xx-xx Tên test case    ← chưa test hoặc FAIL
```

Nếu FAIL, ghi chú ngay bên dưới:
```markdown
- [ ] TC-02-05 GĐ duyệt thiết kế → S5
  > ❌ FAIL: status không chuyển, lỗi 500. Xem issue #42
```

---

## Loại test

| Ký hiệu | Loại |
|---------|------|
| API | Gọi trực tiếp qua Postman / curl / pytest |
| UI | Test thủ công trên trình duyệt |
| AUTO | Có thể tự động hóa bằng pytest |

Các TC không có ghi chú đặc biệt → test qua API.  
TC có ghi chú `> Test thủ công trên browser` → test UI.

---

## Setup nhanh DB test

```bash
# 1. Tạo DB
psql -U saree -h localhost -p 5432 -c 'CREATE DATABASE "saree-erp-test";'

# 2. Chạy migration
cd backend && POSTGRES_DB=saree-erp-test alembic upgrade head

# 3. Chạy backend test (port 8001)
POSTGRES_DB=saree-erp-test uvicorn app.main:app --port 8001 --reload
```

Chi tiết xem [00_TEST_DB_SETUP.md](./00_TEST_DB_SETUP.md).

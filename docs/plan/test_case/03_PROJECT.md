# TC-03: Quản lý Dự án (Project)

## Điều kiện tiên quyết
- DB test đã seed
- Có ít nhất 1 báo giá ở S9_CONTRACT (từ TC-02)
- Tài khoản: admin@test.com, pm@test.com, sales@test.com

---

## DỰ ÁN KHÁCH HÀNG (từ báo giá)

### TC-03-01: Tạo hợp đồng từ báo giá S9 → dự án được tạo tự động

**Actor:** sales@test.com hoặc admin  
**Steps:**
1. Báo giá ở S9_CONTRACT
2. POST `/api/v1/contracts/` với:
   ```json
   {
     "quotation_id": "...",
     "value": 500000000,
     "signed_date": "2026-05-01",
     "start_date": "2026-05-10",
     "end_date": "2026-08-10"
   }
   ```

**Expected:**
- Hợp đồng được tạo
- Project được tạo tự động với `project_type = "client"`
- Project có `start_date`, `end_date` từ hợp đồng
- Project có nhân sự từ báo giá

---

### TC-03-02: Dự án khách hàng hiển thị badge xanh

**Steps:**
1. GET `/api/v1/projects/`

**Expected:**
- Project vừa tạo có `project_type = "client"`

---

### TC-03-03: PM được tự động thêm vào dự án từ báo giá

**Steps:**
1. GET `/api/v1/projects/{id}/members`

**Expected:**
- Danh sách thành viên bao gồm các user đã tham gia báo giá

---

## DỰ ÁN NỘI BỘ

### TC-03-04: Tạo dự án nội bộ với ngày bắt đầu/kết thúc

**Actor:** pm@test.com (quyền PROJECT_CREATE)  
**Steps:**
1. POST `/api/v1/projects/` với:
   ```json
   {
     "name": "Dự án nâng cấp văn phòng nội bộ",
     "code": "INT-20260529",
     "start_date": "2026-06-01",
     "end_date": "2026-07-31",
     "status": "planning",
     "project_type": "internal"
   }
   ```

**Expected:**
- HTTP 201
- `project_type = "internal"`
- `start_date` và `end_date` đúng với giá trị nhập

---

### TC-03-05: Tạo dự án nội bộ thiếu ngày → dùng giá trị mặc định

**Steps:**
1. POST project không có `start_date`, `end_date`

**Expected:**
- `start_date = today`
- `end_date = today + 30 ngày`

---

### TC-03-06: Dự án nội bộ hiển thị badge tím

**Steps:**
1. GET `/api/v1/projects/{id}`

**Expected:**
- `project_type = "internal"`

---

### TC-03-07: Người tạo dự án nội bộ tự thấy dự án trong danh sách

**Steps:**
1. pm@test.com tạo dự án nội bộ
2. GET `/api/v1/projects/` với token pm@test.com

**Expected:**
- Dự án vừa tạo có trong danh sách
- (Dù pm chưa được thêm làm thành viên chính thức)

---

## QUẢN LÝ THÀNH VIÊN DỰ ÁN

### TC-03-08: Thêm thành viên vào dự án

**Actor:** pm@test.com  
**Steps:**
1. POST `/api/v1/projects/{id}/members` với `user_id` của tech@test.com

**Expected:**
- HTTP 201
- Thành viên được thêm với role phù hợp

---

### TC-03-09: Xóa thành viên khỏi dự án

**Steps:**
1. DELETE `/api/v1/projects/{id}/members/{user_id}`

**Expected:**
- HTTP 200
- User không còn trong danh sách thành viên

---

### TC-03-10: User không phải thành viên không thấy dự án private

**Steps:**
1. Đăng nhập user không phải thành viên dự án, không có quyền PROJECT_VIEW_ALL
2. GET `/api/v1/projects/{id}`

**Expected:**
- HTTP 403 hoặc 404

---

### TC-03-11: User có quyền PROJECT_VIEW_ALL thấy tất cả dự án

**Steps:**
1. Đăng nhập user có PROJECT_VIEW_ALL
2. GET `/api/v1/projects/`

**Expected:**
- Trả về tất cả dự án (cả client lẫn internal)

---

## LỌC & TÌM KIẾM DỰ ÁN

### TC-03-12: Lọc dự án theo loại

**Steps:**
1. GET `/api/v1/projects/?project_type=internal`

**Expected:**
- Chỉ trả về dự án nội bộ

---

### TC-03-13: Tìm kiếm dự án theo tên/mã

**Steps:**
1. GET `/api/v1/projects/?search=VP ABC`

**Expected:**
- Trả về dự án có tên hoặc mã chứa "VP ABC"

---

## CẬP NHẬT TRẠNG THÁI DỰ ÁN

### TC-03-14: Cập nhật trạng thái dự án

**Steps:**
1. PATCH `/api/v1/projects/{id}` với `status = "active"`

**Expected:**
- `status = "active"`

---

### TC-03-15: Xóa dự án (chỉ superuser)

**Steps:**
1. pm@test.com DELETE `/api/v1/projects/{id}` → HTTP 403
2. admin@test.com DELETE `/api/v1/projects/{id}` → HTTP 200

**Expected:**
- Chỉ superuser được phép xóa

---

## Checklist tổng
- [ ] TC-03-01 Tạo hợp đồng → dự án khách hàng tự động
- [ ] TC-03-02 Dự án khách hàng type = "client"
- [ ] TC-03-03 PM được thêm từ báo giá
- [ ] TC-03-04 Tạo dự án nội bộ với ngày
- [ ] TC-03-05 Dự án nội bộ thiếu ngày → mặc định
- [ ] TC-03-06 Dự án nội bộ type = "internal"
- [ ] TC-03-07 Người tạo tự thấy dự án
- [ ] TC-03-08 Thêm thành viên
- [ ] TC-03-09 Xóa thành viên
- [ ] TC-03-10 User ngoài không thấy dự án
- [ ] TC-03-11 PROJECT_VIEW_ALL thấy tất cả
- [ ] TC-03-12 Lọc theo loại
- [ ] TC-03-13 Tìm theo tên/mã
- [ ] TC-03-14 Cập nhật trạng thái
- [ ] TC-03-15 Xóa dự án chỉ superuser

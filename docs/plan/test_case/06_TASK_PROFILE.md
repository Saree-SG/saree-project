# TC-06: Mẫu Công việc (Task Profile)

## Điều kiện tiên quyết
- Có công ty `company_id = C1`
- Có dự án P1 (thuộc C1) với cây task đầy đủ từ TC-04
- Tài khoản: pm@test.com, admin@test.com

---

## TẠO MẪU

### TC-06-01: Lưu Hạng mục làm mẫu (từ task tầng 0)

**Actor:** pm@test.com  
**Steps:**
1. Trong tree view, click ⋮ cạnh Hạng mục T0
2. Chọn "Lưu làm mẫu"
3. POST `/api/v1/task-profiles/from-task/{T0_id}` với:
   ```json
   { "name": "Mẫu Hệ thống điện", "description": "Chuẩn cho dự án văn phòng" }
   ```

**Expected:**
- HTTP 201
- Profile tạo với đầy đủ `items` (toàn bộ cây con)
- `company_id = C1`
- `duration_days` của từng item = (end_time - start_time).days

---

### TC-06-02: Mẫu lưu đúng cấu trúc phân cấp

**Steps:**
1. GET `/api/v1/task-profiles/{profile_id}`

**Expected:**
- `items` chứa tất cả node từ T0 xuống tầng 4
- Mỗi item có `level`, `parent_item_id`, `duration_days`, `order_index`
- Item gốc (T0) có `parent_item_id = null`

---

### TC-06-03: Chỉ tầng 0 (Hạng mục) được lưu làm mẫu

**Steps:**
1. Thử lưu làm mẫu từ task tầng 1, 2, 3, 4

**Expected:**
- Chỉ cho phép với task tầng 0 (hoặc UI ẩn nút với task không phải tầng 0)

---

### TC-06-04: Tạo mẫu rỗng (profile không có items)

**Steps:**
1. POST `/api/v1/task-profiles/` với:
   ```json
   { "name": "Mẫu trống", "company_id": "C1" }
   ```

**Expected:**
- HTTP 201
- `items = []`

---

## ÁP DỤNG MẪU

### TC-06-05: Áp dụng mẫu vào dự án mới → tạo cây task tự động

**Actor:** pm@test.com  
**Steps:**
1. Có dự án P2 (mới, chưa có task)
2. POST `/api/v1/task-profiles/{profile_id}/apply` với:
   ```json
   {
     "project_id": "P2",
     "parent_task_id": null,
     "assignee_id": "tech_user_id"
   }
   ```

**Expected:**
- HTTP 201
- Cây task được tạo trong P2 với cùng cấu trúc như mẫu
- `level` đúng theo phân cấp
- `duration_days` được chuyển thành `end_time = start_time + duration_days`
- `start_time` = ngày tạo (today)

---

### TC-06-06: Áp dụng mẫu với parent_task_id → task mới là con của task chỉ định

**Steps:**
1. P2 đã có Hạng mục T_parent (tầng 0)
2. Apply profile với `parent_task_id = T_parent_id`

**Expected:**
- Task gốc của mẫu được tạo như con của T_parent
- Level điều chỉnh: nếu T_parent là tầng 0, root của mẫu là tầng 1

---

### TC-06-07: Áp dụng mẫu giữ nguyên thứ tự (order_index)

**Steps:**
1. Mẫu có items với order_index: 1, 2, 3
2. Apply mẫu vào dự án

**Expected:**
- Task được tạo với thứ tự tương ứng

---

### TC-06-08: Áp dụng mẫu rỗng → không tạo task nào, trả về []

**Steps:**
1. Apply profile có `items = []`

**Expected:**
- HTTP 200 hoặc 201
- Trả về `[]` (không có task nào được tạo)

---

## QUẢN LÝ MẪU

### TC-06-09: Liệt kê mẫu theo công ty

**Steps:**
1. GET `/api/v1/task-profiles/?company_id=C1`

**Expected:**
- Chỉ trả về mẫu thuộc công ty C1

---

### TC-06-10: Mẫu của công ty khác không hiện trong danh sách

**Steps:**
1. Tạo mẫu với `company_id = C2`
2. GET profiles với `company_id = C1`

**Expected:**
- Mẫu của C2 không xuất hiện

---

### TC-06-11: Cập nhật tên và mô tả mẫu

**Steps:**
1. PATCH `/api/v1/task-profiles/{id}` với `name = "Mẫu mới"`, `description = "..."`

**Expected:**
- Profile cập nhật đúng
- Items không bị ảnh hưởng

---

### TC-06-12: Thêm item vào mẫu sau khi tạo

**Steps:**
1. POST `/api/v1/task-profiles/{id}/items` với item mới

**Expected:**
- Item được thêm vào profile
- `order_index` tự động hoặc theo chỉ định

---

### TC-06-13: Cập nhật item trong mẫu

**Steps:**
1. PATCH `/api/v1/task-profiles/{id}/items/{item_id}` với `duration_days = 14`

**Expected:**
- Item cập nhật `duration_days = 14`

---

### TC-06-14: Xóa item trong mẫu → xóa cả con của item đó

**Steps:**
1. Xóa item tầng 1 trong mẫu (có 3 item con)

**Expected:**
- Item và toàn bộ con bị xóa khỏi mẫu

---

### TC-06-15: Xóa mẫu

**Steps:**
1. DELETE `/api/v1/task-profiles/{id}`

**Expected:**
- HTTP 200
- Mẫu không còn trong danh sách
- Các task đã tạo từ mẫu này vẫn còn (không bị xóa)

---

## UI FLOW (Test thủ công)

### TC-06-16: Chọn mẫu khi tạo Hạng mục mới

> Test thủ công trên browser  
**Steps:**
1. Mở dialog Tạo Hạng mục
2. Dropdown "Mẫu công việc" có danh sách mẫu của công ty
3. Chọn mẫu → nhập tên → nhấn Tạo

**Expected:**
- Task được tạo với cây con từ mẫu

---

### TC-06-17: Nút Mẫu → Quản lý mẫu → xem danh sách

> Test thủ công  
**Steps:**
1. Tab Công việc → nút Mẫu
2. Chọn Quản lý mẫu

**Expected:**
- Dialog hiển thị danh sách mẫu công ty
- Có nút Xóa, Sửa cho từng mẫu

---

## Checklist tổng
- [ ] TC-06-01 Lưu Hạng mục làm mẫu
- [ ] TC-06-02 Mẫu lưu đúng cấu trúc
- [ ] TC-06-03 Chỉ tầng 0 được lưu mẫu
- [ ] TC-06-04 Tạo mẫu rỗng
- [ ] TC-06-05 Apply mẫu → tạo cây task
- [ ] TC-06-06 Apply với parent_task_id
- [ ] TC-06-07 Giữ order_index
- [ ] TC-06-08 Apply mẫu rỗng → []
- [ ] TC-06-09 List mẫu theo công ty
- [ ] TC-06-10 Mẫu công ty khác không lộ
- [ ] TC-06-11 Cập nhật tên/mô tả mẫu
- [ ] TC-06-12 Thêm item vào mẫu
- [ ] TC-06-13 Cập nhật item
- [ ] TC-06-14 Xóa item → cascade con
- [ ] TC-06-15 Xóa mẫu (task hiện hữu không xóa)
- [ ] TC-06-16 Chọn mẫu khi tạo Hạng mục (UI)
- [ ] TC-06-17 Quản lý mẫu dialog (UI)

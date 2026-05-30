# TC-04: Cây Công việc 5 Tầng (Task Hierarchy)

## Điều kiện tiên quyết
- Có dự án `project_id = P1`
- Tài khoản: pm@test.com, tech@test.com

## Sơ đồ phân tầng
```
Tầng 0 — Hạng mục     (level=0)
  └─ Tầng 1 — Công việc  (level=1)
       └─ Tầng 2 — Đầu việc  (level=2)
            └─ Tầng 3 — Bước  (level=3)
                 └─ Tầng 4 — Chi tiết  (level=4)  ← không tạo con
```

---

## TẠO CÂY CÔNG VIỆC

### TC-04-01: Tạo Hạng mục (tầng 0) — không có cha

**Actor:** pm@test.com  
**Steps:**
1. POST `/api/v1/tasks/` với:
   ```json
   {
     "project_id": "P1",
     "name": "Hệ thống điện",
     "parent_task_id": null,
     "start_time": "2026-06-01T00:00:00",
     "end_time": "2026-07-31T00:00:00"
   }
   ```

**Expected:**
- HTTP 201
- `level = 0`
- `parent_task_id = null`

---

### TC-04-02: Tạo Công việc (tầng 1) — con của Hạng mục

**Steps:**
1. POST `/api/v1/tasks/` với `parent_task_id = T0_id`

**Expected:**
- `level = 1`
- `parent_task_id = T0_id`

---

### TC-04-03: Tạo Đầu việc (tầng 2) → Bước (tầng 3) → Chi tiết (tầng 4)

**Steps:**
1. Tạo task với cha là tầng 1 → `level = 2`
2. Tạo task với cha là tầng 2 → `level = 3`
3. Tạo task với cha là tầng 3 → `level = 4`

**Expected:**
- Mỗi task có `level = parent.level + 1`

---

### TC-04-04: Không thể tạo con của tầng 4

**Steps:**
1. POST task với `parent_task_id` = id của task tầng 4

**Expected:**
- HTTP 422 — "Task tầng 4 không thể có task con"

---

### TC-04-05: Level được tính tự động từ cha — không thể override

**Steps:**
1. POST task với `parent_task_id = T1_id` và `level = 0` (cố override)

**Expected:**
- `level = 2` (= T1.level + 1), không phải 0

---

## XEM TREE VIEW

### TC-04-06: Lấy danh sách task dạng phẳng của dự án

**Steps:**
1. GET `/api/v1/tasks/?project_id=P1`

**Expected:**
- Trả về tất cả task của dự án
- Mỗi task có `level`, `parent_task_id`

---

### TC-04-07: Lấy subtree của một task

**Steps:**
1. GET `/api/v1/tasks/{T0_id}/subtree` (hoặc filter `parent_task_id=T0_id`)

**Expected:**
- Trả về task T0 và tất cả con cháu

---

### TC-04-08: Task ở các tầng khác nhau hiển thị đúng màu/label trên UI

> Test thủ công trên browser  
**Steps:**
1. Mở dự án → tab Công việc → tab Cây
2. Kiểm tra màu badge của từng tầng:
   - Tầng 0 (Hạng mục): xanh dương
   - Tầng 1 (Công việc): xanh cyan
   - Tầng 2 (Đầu việc): xanh teal
   - Tầng 3 (Bước): xám slate
   - Tầng 4 (Chi tiết): xám nhạt

**Expected:**
- Màu và label đúng theo LEVEL_CONFIG

---

### TC-04-09: Expand / collapse node trong tree view

> Test thủ công trên browser  
**Steps:**
1. Click mũi tên ▶ cạnh Hạng mục → expand
2. Click lại → collapse

**Expected:**
- Con ẩn/hiện đúng

---

## PHÂN CÔNG VÀ NGÀY THÁNG

### TC-04-10: Phân công người phụ trách cho task

**Steps:**
1. POST `/api/v1/tasks/{id}/assignees` với `user_id = tech@test.com`

**Expected:**
- Task có assignee
- Chỉ thành viên dự án được phân công

---

### TC-04-11: Phân công user không phải thành viên dự án → bị từ chối

**Steps:**
1. POST assignee với user ngoài dự án

**Expected:**
- HTTP 422 hoặc 400

---

### TC-04-12: Ngày kết thúc task không sớm hơn ngày bắt đầu

**Steps:**
1. POST task với `start_time > end_time`

**Expected:**
- HTTP 422

---

### TC-04-13: Cập nhật task cha → delay cascade xuống các tầng con

**Steps:**
1. Tạo cây: T0 → T1 → T2 → T3
2. PATCH T0 kéo dài `end_time` thêm 7 ngày

**Expected:**
- T1, T2, T3 cũng được kéo dài tương ứng (delay cascade đệ quy)

---

## TIẾN ĐỘ ROLLUP (từ con lên cha)

### TC-04-14: Tiến độ task cha = trung bình tiến độ các con

**Steps:**
1. Tạo T0 → T1a, T1b (2 con ngang nhau)
2. Cập nhật tiến độ T1a = 50%, T1b = 100%
3. GET T0

**Expected:**
- `completion_pct` của T0 = 75%

---

### TC-04-15: Tiến độ rollup đệ quy qua nhiều tầng

**Steps:**
1. Cây 4 tầng: T0 → T1 → T2 → T3 (chỉ T3 có tiến độ thực)
2. Set T3 = 80%
3. GET T0

**Expected:**
- T2 = 80%, T1 = 80%, T0 = 80% (rollup đệ quy)

---

## XÓA TASK

### TC-04-16: Xóa task có con → xóa cả cây con (cascade)

**Steps:**
1. Xóa task tầng 0 có 3 tầng con

**Expected:**
- Task tầng 0 và tất cả con cháu bị xóa

---

### TC-04-17: Xóa task lá (tầng 4) — không ảnh hưởng anh em

**Steps:**
1. Xóa task tầng 4

**Expected:**
- Chỉ task đó bị xóa, anh em và cha vẫn còn

---

## Checklist tổng
- [ ] TC-04-01 Tạo Hạng mục level=0
- [ ] TC-04-02 Tạo Công việc level=1
- [ ] TC-04-03 Tạo tầng 2, 3, 4
- [ ] TC-04-04 Không tạo con tầng 4
- [ ] TC-04-05 Level tự động từ cha
- [ ] TC-04-06 List task phẳng
- [ ] TC-04-07 Subtree của task
- [ ] TC-04-08 Màu/label đúng tầng (UI)
- [ ] TC-04-09 Expand/collapse tree (UI)
- [ ] TC-04-10 Phân công assignee
- [ ] TC-04-11 Phân công user ngoài dự án → từ chối
- [ ] TC-04-12 Ngày không hợp lệ → từ chối
- [ ] TC-04-13 Delay cascade đệ quy
- [ ] TC-04-14 Tiến độ rollup từ 2 con
- [ ] TC-04-15 Tiến độ rollup 4 tầng
- [ ] TC-04-16 Xóa task → cascade con
- [ ] TC-04-17 Xóa task lá

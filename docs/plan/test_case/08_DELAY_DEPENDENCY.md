# TC-08: Số ngày trễ & Task Phụ thuộc (Delay & Dependencies)

## Điều kiện tiên quyết
- DB test đã seed
- Backend chạy trên port 8001
- Dự án P1 có cây task 3–4 tầng
- Tài khoản: pm@test.com (TASK_UPDATE), tech@test.com (assignee), director@test.com

---

## PHẦN A: COMPUTED STATUS — OVERDUE

> Trạng thái trễ được tính **on-the-fly** khi đọc task, không lưu vào DB.

### Quy tắc tính:
```
end_time đã qua (< now)?
  └─ task nằm trên critical path?
       YES → "overdue_critical"
       NO → parent.end_time cũng đã qua?
              YES → "overdue_critical"
              NO  → "overdue_local"
end_time trong 24h tới?
  └─ "due_soon"
Còn lại → trạng thái gốc (todo/in_progress/...)
```

---

### TC-08-01: Task hết hạn, không có cha, không critical path → overdue_critical

**Setup:**
- Tạo task TA: `end_time = 3 ngày trước`
- TA không có parent, không phải critical path

**Steps:**
1. GET `/api/v1/tasks/{TA_id}`

**Expected:**
- `computed_status = "overdue_critical"`

---

### TC-08-02: Task hết hạn nhưng cha chưa hết hạn → overdue_local

**Setup:**
- Task cha TB: `end_time = 10 ngày tới`
- Task con TC: `end_time = 3 ngày trước` (đã qua)
- TC không phải critical path

**Steps:**
1. GET `/api/v1/tasks/{TC_id}`

**Expected:**
- `computed_status = "overdue_local"` (cha vẫn còn hạn → chỉ trễ nội bộ)

---

### TC-08-03: Task hết hạn, cha cũng hết hạn → overdue_critical

**Setup:**
- Task cha TB: `end_time = 5 ngày trước`
- Task con TC: `end_time = 3 ngày trước`

**Steps:**
1. GET `/api/v1/tasks/{TC_id}`

**Expected:**
- `computed_status = "overdue_critical"` (cả cha lẫn con đều quá hạn)

---

### TC-08-04: Task nằm trên critical path, hết hạn → luôn overdue_critical

**Setup:**
- Task TD: `end_time = 1 ngày trước`, `is_on_critical_path = true`

**Steps:**
1. GET `/api/v1/tasks/{TD_id}`

**Expected:**
- `computed_status = "overdue_critical"` (bất kể cha còn hạn hay không)

---

### TC-08-05: Task hết hạn trong 24h → due_soon

**Setup:**
- Task TE: `end_time = 12 giờ từ bây giờ`

**Steps:**
1. GET `/api/v1/tasks/{TE_id}`

**Expected:**
- `computed_status = "due_soon"`

---

### TC-08-06: Task đã "done" hoặc "review" → không bao giờ overdue

**Setup:**
- Task TF: `status = "done"`, `end_time = 10 ngày trước`
- Task TG: `status = "review"`, `end_time = 5 ngày trước`

**Steps:**
1. GET TF → `computed_status = "done"`
2. GET TG → `computed_status = "review"`

**Expected:**
- done/review không bị ghi đè thành overdue

---

### TC-08-07: Dashboard hiển thị đúng phân loại overdue_local / overdue_critical

**Steps:**
1. GET `/api/v1/tasks/my-tasks` hoặc `/api/v1/projects/{id}/dashboard`

**Expected:**
- `overdue_critical` và `overdue_local` là 2 nhóm tách biệt
- Mỗi task nằm đúng nhóm theo logic trên

---

---

## PHẦN B: YÊU CẦU GIA HẠN (Delay Request)

### TC-08-08: Assignee gửi yêu cầu gia hạn deadline

**Actor:** tech@test.com (assignee của task)  
**Steps:**
1. POST `/api/v1/tasks/{id}/comments` với:
   ```json
   {
     "comment_type": "delay_justification",
     "content": "Thiếu vật tư, cần thêm 7 ngày",
     "requested_end_time": "2026-07-10T00:00:00"
   }
   ```

**Expected:**
- HTTP 201
- `comment_type = "delay_justification"`
- `approval_status = "PENDING"`

---

### TC-08-09: User không phải assignee không gửi được yêu cầu gia hạn

**Actor:** pm@test.com (không phải assignee)  
**Steps:**
1. POST yêu cầu gia hạn như TC-08-08

**Expected:**
- HTTP 403 — "Chỉ người được giao task mới được yêu cầu gia hạn"

---

### TC-08-10: Không gửi yêu cầu thứ 2 khi còn yêu cầu PENDING

**Steps:**
1. Đã có 1 yêu cầu PENDING
2. Gửi yêu cầu mới

**Expected:**
- HTTP 409 — "A delay request is already pending"

---

### TC-08-11: requested_end_time phải sau deadline hiện tại

**Steps:**
1. Task có `end_time = 2026-07-01`
2. POST với `requested_end_time = 2026-06-20` (trước deadline)

**Expected:**
- HTTP 422 — "requested_end_time must be later than the current task deadline"

---

### TC-08-12: PM phê duyệt gia hạn → deadline task cập nhật

**Actor:** pm@test.com  
**Steps:**
1. POST `/api/v1/tasks/{id}/comments/{comment_id}/approve` với:
   ```json
   { "approval_status": "APPROVED" }
   ```
2. GET task

**Expected:**
- `end_time` của task = `requested_end_time` từ yêu cầu
- `comment.approval_status = "APPROVED"`

---

### TC-08-13: Phê duyệt gia hạn → cascade deadline lên tất cả ancestor (5 tầng)

**Setup:**
- Cây: T0 (deadline 2026-08-01) → T1 (2026-07-15) → T2 (2026-07-01) → T3 (2026-06-30)
- T3 yêu cầu gia hạn đến 2026-07-20

**Steps:**
1. PM phê duyệt yêu cầu của T3

**Expected:**
- T3: `end_time = 2026-07-20`
- T2: `end_time = 2026-07-20` (cascade lên vì T2 chỉ có đến 07-01)
- T1: `end_time = 2026-07-20` (cascade lên vì T1 chỉ có đến 07-15)
- T0: **KHÔNG thay đổi** (T0 có deadline 08-01 >= 07-20 → dừng cascade)

---

### TC-08-14: Cascade dừng khi ancestor đã có deadline rộng hơn

**Setup:**
- T0 deadline 2026-09-30, T1 deadline 2026-07-01
- T1 gia hạn đến 2026-07-20

**Steps:**
1. Phê duyệt gia hạn T1

**Expected:**
- T1: 2026-07-20
- T0: không đổi (2026-09-30 >= 2026-07-20 → dừng)

---

### TC-08-15: Gia hạn vượt deadline dự án → cascade mở rộng deadline dự án

**Setup:**
- Dự án có `end_date = 2026-07-31`
- Task yêu cầu gia hạn đến 2026-08-15

**Steps:**
1. PM phê duyệt

**Expected:**
- Task: `end_time = 2026-08-15`
- Project: `end_date = 2026-08-15`

---

### TC-08-16: Gia hạn vượt deadline dự án 30 ngày → bị từ chối, cần GĐ

**Setup:**
- Dự án `end_date = 2026-07-31`
- Yêu cầu gia hạn đến 2026-09-05 (hơn 30 ngày)

**Steps:**
1. PM phê duyệt

**Expected:**
- HTTP 422 — "Vượt quá deadline dự án quá xa, cần Giám đốc xác nhận"

---

### TC-08-17: PM từ chối yêu cầu gia hạn → deadline không đổi

**Steps:**
1. POST approve với `approval_status = "REJECTED"`
2. GET task

**Expected:**
- `end_time` không thay đổi
- `comment.approval_status = "REJECTED"`

---

### TC-08-18: Người tạo yêu cầu không thể tự duyệt

**Steps:**
1. tech gửi yêu cầu, rồi cũng chính tech gửi approve

**Expected:**
- HTTP 403 — "Không thể duyệt yêu cầu do chính bạn tạo"

---

### TC-08-19: Task đã done không gửi được yêu cầu gia hạn

**Steps:**
1. Task `status = "done"`
2. POST delay_justification

**Expected:**
- HTTP 422 — "Cannot request delay for a completed task"

---

---

## PHẦN C: DEPENDENCY — LOẠI PHỤ THUỘC

### Các loại hỗ trợ: FS (Finish-to-Start), SS, FF, SF

### TC-08-20: Tạo dependency FS (phổ biến nhất)

**Setup:** Task A, Task B cùng project  
**Steps:**
1. POST `/api/v1/tasks/{B_id}/dependencies` với:
   ```json
   {
     "blocking_task_id": "A_id",
     "dependent_task_id": "B_id",
     "dependency_type": "FS",
     "lag_hours": 0
   }
   ```

**Expected:**
- HTTP 201
- B chờ A kết thúc mới bắt đầu

---

### TC-08-21: Tạo dependency SS (Start-to-Start)

**Steps:**
1. POST với `dependency_type = "SS"`

**Expected:**
- HTTP 201
- B chỉ bắt đầu sau khi A bắt đầu

---

### TC-08-22: Tạo dependency FF và SF

**Steps:**
1. POST với `dependency_type = "FF"` → HTTP 201
2. POST với `dependency_type = "SF"` → HTTP 201

**Expected:**
- Cả hai được tạo thành công

---

### TC-08-23: Dependency type không hợp lệ → từ chối

**Steps:**
1. POST với `dependency_type = "XY"`

**Expected:**
- HTTP 422 — "dependency_type must be one of FS, SS, FF, SF"

---

### TC-08-24: Task không thể phụ thuộc vào chính nó

**Steps:**
1. POST với `blocking_task_id = dependent_task_id = A_id`

**Expected:**
- HTTP 422 — "Task không thể phụ thuộc vào chính nó"

---

### TC-08-25: Dependency giữa 2 task khác project → từ chối

**Steps:**
1. POST dependency với task từ project khác

**Expected:**
- HTTP 422 — "Không thể tạo phụ thuộc giữa các task khác project"

---

### TC-08-26: Dependency trùng lặp → từ chối

**Steps:**
1. Tạo A→B dependency
2. Tạo lại A→B dependency

**Expected:**
- HTTP 409 — "Phụ thuộc này đã tồn tại"

---

### TC-08-27: Dependency vòng tròn trực tiếp A→B→A → từ chối

**Steps:**
1. Tạo A→B (FS)
2. Tạo B→A

**Expected:**
- HTTP 422 — "Tạo phụ thuộc này sẽ tạo vòng lặp phụ thuộc"

---

### TC-08-28: Dependency vòng tròn gián tiếp A→B→C→A → từ chối

**Steps:**
1. Tạo A→B, B→C
2. Thêm C→A

**Expected:**
- HTTP 422 (cycle detection)

---

### TC-08-29: Dependency với lag_hours

**Steps:**
1. POST với `lag_hours = 48` (task B chờ A xong + 48 giờ)

**Expected:**
- HTTP 201
- `lag_hours = 48` được lưu đúng

---

### TC-08-30: Xóa dependency

**Steps:**
1. DELETE `/api/v1/tasks/{task_id}/dependencies/{dep_id}`

**Expected:**
- HTTP 200
- B không còn phụ thuộc vào A
- Critical path được recalculate

---

### TC-08-31: Chỉ assignor hoặc user có TASK_UPDATE mới thêm/xóa dependency

**Steps:**
1. tech@test.com (chỉ là assignee, không phải assignor) cố thêm dependency

**Expected:**
- HTTP 403 — "Chỉ người tạo task hoặc quản lý mới được sửa phụ thuộc"

---

---

## PHẦN D: CRITICAL PATH

### TC-08-32: Recalculate critical path sau khi thêm dependency

**Steps:**
1. Tạo chuỗi: A(5d) → B(3d) → C(7d) [tổng 15d]
2. Song song: D(8d) → E(6d) [tổng 14d]
3. POST thêm dependencies
4. GET tasks

**Expected:**
- A, B, C có `is_on_critical_path = true` (đường dài nhất = 15d)
- D, E có `is_on_critical_path = false`

---

### TC-08-33: Recalculate critical path sau khi xóa dependency

**Steps:**
1. Xóa dependency A→B (trong chain A→B→C)
2. GET task A, B

**Expected:**
- `is_on_critical_path` được cập nhật lại đúng

---

### TC-08-34: Xem Gantt chart — trả đúng danh sách dependencies

**Steps:**
1. GET `/api/v1/projects/{id}/gantt`

**Expected:**
- `tasks`: danh sách task đầy đủ
- `dependencies`: danh sách link với `blocking_task_id`, `dependent_task_id`, `dependency_type`, `lag_hours`

---

---

## PHẦN E: CASCADE KHI KÉO DÀI DEADLINE (qua update)

### TC-08-35: Kéo deadline task cha → cascade xuống task con

**Setup:**
- T0 end=2026-07-31, T1 end=2026-07-15, T2 end=2026-07-01

**Steps:**
1. PATCH T0 với `end_time = 2026-08-31` (kéo dài 1 tháng)
2. GET T1, T2

**Expected:**
- T1 và T2 cũng được kéo dài tương ứng (delay cascade)

---

### TC-08-36: Rút ngắn deadline task cha mà con có deadline dài hơn → báo lỗi

**Setup:**
- T0 end=2026-08-31, T1 end=2026-08-15

**Steps:**
1. PATCH T0 với `end_time = 2026-07-31` (rút ngắn)

**Expected:**
- HTTP 422 — `'Công việc con "T1" kết thúc (2026-08-15) sau deadline mới (2026-07-31)'`

---

### TC-08-37: Cascade qua tất cả 5 tầng khi task gốc bị delay

**Setup:**
- Cây đầy đủ 5 tầng: T0→T1→T2→T3→T4
- Tất cả end_time trùng nhau: 2026-07-31

**Steps:**
1. PATCH T0 kéo dài đến 2026-08-31

**Expected:**
- T1, T2, T3, T4 đều được cập nhật `end_time = 2026-08-31`

---

---

## Checklist tổng

### A: Computed Status (Overdue)
- [ ] TC-08-01 Hết hạn, không cha → overdue_critical
- [ ] TC-08-02 Hết hạn, cha chưa hết hạn → overdue_local
- [ ] TC-08-03 Hết hạn, cha cũng hết hạn → overdue_critical
- [ ] TC-08-04 Critical path + hết hạn → overdue_critical
- [ ] TC-08-05 Hết hạn trong 24h → due_soon
- [ ] TC-08-06 done/review không bị ghi đè
- [ ] TC-08-07 Dashboard phân loại đúng

### B: Delay Request
- [ ] TC-08-08 Assignee gửi yêu cầu gia hạn
- [ ] TC-08-09 Non-assignee không gửi được
- [ ] TC-08-10 Không gửi 2 yêu cầu PENDING cùng lúc
- [ ] TC-08-11 requested_end_time phải sau deadline hiện tại
- [ ] TC-08-12 PM phê duyệt → deadline cập nhật
- [ ] TC-08-13 Cascade lên 5 tầng ancestor
- [ ] TC-08-14 Cascade dừng khi ancestor đủ rộng
- [ ] TC-08-15 Vượt deadline dự án → cascade mở rộng project
- [ ] TC-08-16 Vượt 30 ngày → cần GĐ xác nhận
- [ ] TC-08-17 Từ chối → deadline không đổi
- [ ] TC-08-18 Người tạo không tự duyệt
- [ ] TC-08-19 Task done không gửi được yêu cầu

### C: Dependency
- [ ] TC-08-20 Tạo FS
- [ ] TC-08-21 Tạo SS
- [ ] TC-08-22 Tạo FF và SF
- [ ] TC-08-23 Type không hợp lệ
- [ ] TC-08-24 Phụ thuộc chính nó
- [ ] TC-08-25 Khác project
- [ ] TC-08-26 Trùng lặp
- [ ] TC-08-27 Vòng tròn trực tiếp
- [ ] TC-08-28 Vòng tròn gián tiếp
- [ ] TC-08-29 lag_hours
- [ ] TC-08-30 Xóa dependency
- [ ] TC-08-31 Quyền thêm/xóa dependency

### D: Critical Path
- [ ] TC-08-32 Recalculate sau thêm dependency
- [ ] TC-08-33 Recalculate sau xóa dependency
- [ ] TC-08-34 Gantt trả đúng dependencies

### E: Cascade Deadline
- [ ] TC-08-35 Kéo dài cha → cascade xuống con
- [ ] TC-08-36 Rút ngắn cha mà con dài hơn → lỗi
- [ ] TC-08-37 Cascade qua đủ 5 tầng

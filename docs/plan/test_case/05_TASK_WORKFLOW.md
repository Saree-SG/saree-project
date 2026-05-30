# TC-05: Luồng Trạng thái & Tiến độ Công việc (Task Workflow)

## Điều kiện tiên quyết
- Có dự án P1 và cây task từ TC-04
- Tài khoản: pm@test.com (manager), tech@test.com (assignee)

## Sơ đồ trạng thái
```
todo ──► in_progress ──► review ──► done
  └──────────────────────────────────┘ (manager confirm)
         ▲
    blocked (khi có blocker chưa done)
         │
    (blocker done → tự unblock)
```

---

## THAY ĐỔI TRẠNG THÁI

### TC-05-01: Task mới tạo ở trạng thái "todo"

**Steps:**
1. Tạo task mới

**Expected:**
- `status = "todo"`
- `completion_pct = 0`

---

### TC-05-02: Bắt đầu task → "in_progress"

**Actor:** tech@test.com (assignee)  
**Steps:**
1. PATCH `/api/v1/tasks/{id}` với `status = "in_progress"`

**Expected:**
- `status = "in_progress"`

---

### TC-05-03: Thêm tiến độ khi "in_progress"

**Steps:**
1. POST `/api/v1/tasks/{id}/progress` với `percent = 40`, `note = "Đã hoàn thành phần đi dây"`

**Expected:**
- HTTP 201
- `completion_pct` của task = 40

---

### TC-05-04: Tiến độ tích lũy — cộng dồn qua nhiều lần cập nhật

**Steps:**
1. Lần 1: POST tiến độ 30%
2. Lần 2: POST tiến độ 50%

**Expected:**
- `completion_pct = 80` (cộng dồn)

---

### TC-05-05: Tiến độ đạt 100% → tự chuyển sang "review"

**Steps:**
1. Task đang `in_progress`, `completion_pct = 60`
2. POST tiến độ 40% (thêm vào = 100%)

**Expected:**
- `status = "review"` (tự động)
- `completion_pct = 100`

---

### TC-05-06: Tiến độ vượt 100% → bị giới hạn ở 100%

**Steps:**
1. Task đang ở 80%
2. POST tiến độ 40% (tổng = 120%)

**Expected:**
- `completion_pct = 100` (không vượt 100)
- `status = "review"`

---

### TC-05-07: Manager xác nhận "review" → "done"

**Actor:** pm@test.com  
**Steps:**
1. PATCH task với `status = "done"`

**Expected:**
- `status = "done"`

---

### TC-05-08: Không thể thêm tiến độ vào task "done"

**Steps:**
1. POST tiến độ vào task đã done

**Expected:**
- HTTP 422 — "Công việc đã hoàn thành, không thể cập nhật tiến độ"

---

### TC-05-09: Không thể chuyển từ "done" về "review" hoặc "in_progress"

**Steps:**
1. PATCH task done với `status = "review"` hoặc `status = "in_progress"`

**Expected:**
- HTTP 422 — "Công việc đã hoàn thành, không thể thay đổi trạng thái"

---

### TC-05-10: Thêm tiến độ cho task "todo" → tự chuyển "in_progress"

**Steps:**
1. Task đang ở `todo`
2. POST tiến độ 10%

**Expected:**
- `status = "in_progress"` (tự chuyển khi có tiến độ)
- `completion_pct = 10`

---

## BLOCKER (Phụ thuộc)

### TC-05-11: Thêm task tiên quyết (blocker)

**Steps:**
1. Task B phụ thuộc vào Task A
2. POST `/api/v1/tasks/{B_id}/blockers` với `blocker_task_id = A_id`

**Expected:**
- `status` của B = "blocked"

---

### TC-05-12: Không thể thêm tiến độ khi bị blocked

**Steps:**
1. POST tiến độ vào task B đang bị blocked

**Expected:**
- HTTP 422 — "Task đang bị chặn bởi task khác"

---

### TC-05-13: Hoàn thành task blocker → task bị block tự unblock

**Steps:**
1. Task A chuyển sang `done`
2. GET task B

**Expected:**
- `status` của B = "todo" hoặc "in_progress" (không còn blocked)

---

### TC-05-14: Xóa blocker thủ công

**Steps:**
1. DELETE `/api/v1/tasks/{B_id}/blockers/{A_id}`

**Expected:**
- B không còn blocked bởi A

---

### TC-05-15: Thêm blocker vòng tròn → bị từ chối

**Steps:**
1. A blocks B, B blocks C
2. Cố thêm C blocks A

**Expected:**
- HTTP 422 — circular dependency

---

## HỦY TASK

### TC-05-16: Hủy task (cancelled)

**Steps:**
1. PATCH task với `status = "cancelled"`

**Expected:**
- `status = "cancelled"`
- Task không được tính vào rollup tiến độ cha

---

### TC-05-17: Task bị hủy không ảnh hưởng tiến độ cha

**Steps:**
1. T0 có 2 con: T1a (50%) và T1b (cancelled)
2. GET T0

**Expected:**
- `completion_pct` của T0 = 50% (chỉ tính T1a)

---

## QUYỀN THỰC HIỆN

### TC-05-18: Chỉ assignee hoặc PM mới được thêm tiến độ

**Steps:**
1. User không phải assignee và không phải PM: POST tiến độ

**Expected:**
- HTTP 403

---

### TC-05-19: Chỉ PM hoặc manager mới được confirm "done"

**Steps:**
1. tech@test.com (assignee) cố PATCH status = "done"

**Expected:**
- HTTP 403 (chỉ PM/manager được done)

---

## Checklist tổng
- [ ] TC-05-01 Task mới = todo
- [ ] TC-05-02 Chuyển in_progress
- [ ] TC-05-03 Thêm tiến độ
- [ ] TC-05-04 Tiến độ cộng dồn
- [ ] TC-05-05 100% → tự review
- [ ] TC-05-06 Vượt 100% → giới hạn 100
- [ ] TC-05-07 Manager confirm → done
- [ ] TC-05-08 Không thêm tiến độ khi done
- [ ] TC-05-09 Không regression từ done
- [ ] TC-05-10 Tiến độ khi todo → tự in_progress
- [ ] TC-05-11 Thêm blocker
- [ ] TC-05-12 Không thêm tiến độ khi blocked
- [ ] TC-05-13 Hoàn thành blocker → unblock
- [ ] TC-05-14 Xóa blocker thủ công
- [ ] TC-05-15 Blocker vòng tròn → từ chối
- [ ] TC-05-16 Hủy task
- [ ] TC-05-17 Task hủy không tính vào rollup
- [ ] TC-05-18 Chỉ assignee/PM thêm tiến độ
- [ ] TC-05-19 Chỉ PM confirm done

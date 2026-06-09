# Refactor: Company Detail + Cơ chế tiến độ/bằng chứng công việc

Tổng hợp toàn bộ thay đổi trong phiên làm việc (2026-06-06). Gồm 6 phần độc lập
nhưng liên quan: refactor trang Company, gộp bằng chứng vào báo cáo tiến độ,
gating tiến độ theo duyệt, trọng số task con auto-chia-đều, lan tiến độ lên cha,
và dọn dẹp `TaskProof`.

---

## 1. Refactor trang "Chi tiết công ty" (`/company`)

### Vấn đề
Trang trộn 2 mô hình không nhất quán:
- Tab **Tổng quan** có bộ chọn công ty riêng, mặc định công ty đầu tiên → "ra chi
  tiết 1 công ty dù có nhiều".
- Tab **Phòng ban & Nhân sự** dùng `CompanyManagement` — thực chất là bảng quản lý
  **đa công ty** (liệt kê theo tên công ty), sửa trong dialog.

→ Công ty chọn ở tab này không liên quan tab kia.

### Giải pháp
**1 bộ chọn công ty duy nhất ở header trang**, mọi tab scope theo công ty đó.

### File thay đổi
- `frontend/src/routes/_layout/company.tsx`: thêm `<Select>` công ty ở header,
  state `companyId` chia sẻ, truyền `company` xuống các tab.
- `frontend/src/components/Company/CompanyOverviewPanel.tsx`: bỏ picker nội bộ,
  nhận `company` qua prop.
- `frontend/src/components/Company/CompanyOrgPanel.tsx` (**mới**): quản lý org cho
  **1 công ty đang chọn** (đổi tên, phòng ban, vai trò + quyền, nhân sự) — inline,
  không còn bảng đa công ty / dialog "Edit Company".
- `frontend/src/components/Admin/CompanyManagement.tsx`: **đã xóa** (dead code).

---

## 2. Gộp "bằng chứng" và "ảnh hiện trường" làm một

### Vấn đề
Trên cùng một task có 2 luồng "ảnh + GPS hiện trường" trùng mục đích:

| | Báo cáo tiến độ (progress report) | Bằng chứng (TaskProof) |
|---|---|---|
| Nội dung | Ảnh hiện trường + GPS + **% tiến độ** | Ảnh + note |
| Duyệt | ❌ Không | ✅ approved/rejected |
| Tác động | Cộng vào **% hoàn thành** | Tính vào **điểm chất lượng** |

→ Nhân viên phải upload 2 lần; nhầm "nộp là xong" (báo cáo tiến độ không cần
duyệt) với "bằng chứng được duyệt" (mới tính chất lượng).

### Giải pháp
Ảnh trong **báo cáo tiến độ chính là bằng chứng**; quản lý duyệt ngay trên đó. Bỏ
luồng `TaskProof` khỏi UI.

### Backend
- `models/task.py` — `TaskProgressReport`: thêm `review_status` (pending/approved/
  rejected), `reviewer_id`, `reviewed_at`, `review_note`; thêm vào
  `TaskProgressReportPublic`.
- `alembic/versions/0036_progress_report_review.py`: thêm 4 cột + FK reviewer +
  **backfill** báo cáo cũ → `approved` (giữ nguyên tiến độ hiện có).
- `repositories/task_repository.py`: `get_progress_report_or_404`,
  `update_progress_report`.
- `services/task_service.py`: `review_progress_report` — duyệt/từ chối, ghi audit,
  bắn WS (`task.progress_approved/rejected`), notify người báo cáo;
  `_report_to_public` trả thêm trường review.
- `api/routes/tasks.py`: `PATCH /tasks/{id}/progress-reports/{report_id}`
  (quyền `PROOF_APPROVE`).
- `api/routes/dashboard.py`: điểm **"chất lượng" (year-summary)** tính từ báo cáo
  tiến độ approved/reviewed thay vì `TaskProof`.

### Frontend
- `modules/tasks/taskProgressApi.ts`: `listProgressReportsWithReview`,
  `reviewProgressReport` + type mở rộng review.
- `routes/_layout/tasks.$taskId.tsx`: xóa mục "Bằng chứng hoàn thành"; mỗi báo cáo
  tiến độ có badge trạng thái + nút Duyệt/Từ chối (gate `PROOF_APPROVE`) + dialog
  từ chối nhập lý do.
- `components/Company/YearSummaryPanel.tsx`: nhãn "Bằng chứng duyệt" → "Báo cáo
  duyệt".

---

## 3. Tiến độ chỉ tăng khi được duyệt

### Vấn đề
`sum_progress` cộng **tất cả** báo cáo bất kể review → nộp là tăng ngay, từ chối
không trừ lại.

### Quyết định
- % chỉ tính khi **approved** (pending = 0% cho đến khi duyệt).
- Báo cáo bị từ chối và task đang `review` (đủ 100% trước đó) → **tự đẩy về
  `in_progress`**.

### Backend (`task_service.py`, `task_repository.py`)
- `sum_progress` → chỉ cộng `approved`; `bulk_sum_progress` (Gantt/dashboard) cũng
  vậy.
- Thêm `sum_submitted_progress` (approved + pending) để **chặn nộp vượt 100%** kể
  cả khi đang chờ duyệt.
- `add_progress_report`: báo cáo mới = `pending`, không đẩy lên `review`; chỉ
  `todo → in_progress`. Notify quản lý đổi thành **"chờ duyệt"**.
- `review_progress_report`: duyệt → rollup approved; đủ 100% → `review`; từ chối
  làm tụt < 100% khi đang `review` → `in_progress`.

### Frontend (`tasks.$taskId.tsx`)
- `selfProgress` = tổng **approved**; thêm `submittedProgress` (approved+pending)
  cho giới hạn nhập.
- Nhãn: "Đã duyệt X/100% · chờ duyệt Y% · Chỉ % đã duyệt mới được tính…".

---

## 4. Trọng số task con — auto chia đều

### Vấn đề
Backend coi `progress_weight` chưa đặt = **0** → task con không đóng góp gì vào
tiến độ cha (UI ghi "Chưa đặt trọng số").

### Giải pháp
Trọng số `null` = **"auto"**: tự chia đều phần còn lại
`(100 - tổng trọng số đã đặt tay) / số con auto`. Con đặt tay thì đè lên.
Ví dụ: 3 con trống → mỗi con 33.3%; đặt A=50% → B, C auto 25% mỗi con; tổng = 100%.

### Backend (`task_service.py`, `_rollup_completion_pct`)
- Con auto chia đều phần trọng số chưa cấp; con đặt tay giữ nguyên.

### Frontend (`tasks.$taskId.tsx`)
- `effectiveWeightById` (map trọng số hiệu lực, gồm auto-share); `totalChildWeight`,
  `childContribution`, `wReport` dùng trọng số hiệu lực.
- Bỏ nhãn "Chưa đặt trọng số" → "đóng góp X/Y% (tự chia)".

### Hệ quả: task cha không nộp báo cáo khi con phủ 100%
Có ≥1 con auto → tổng trọng số con = 100 → `wReport = 0` → báo cáo ở cha đóng góp
0%. Xử lý:
- **Frontend**: ẩn form nộp khi `wReport === 0`, hiện chú thích "tiến độ tính hoàn
  toàn từ công việc con".
- **Backend** (`add_progress_report`): chặn API (422) nếu con phủ hết trọng số.

---

## 5. Tự chuyển cha sang `review` khi đủ 100% + notify quản lý

### Backend (`task_service.py`)
- Thêm `_propagate_completion_up(task, actor_id)`: sau khi duyệt/từ chối báo cáo,
  đi ngược lên **toàn bộ chuỗi cha → ông → cụ**, mỗi cấp tính lại rollup:
  - Đạt 100% & chưa ở review → set `review`, ghi audit (`task.auto_review`), bắn
    WS `task.ready_for_review`, **notify quản lý** (`assignor_id`): *"[task] đã đạt
    100% — cần vào kiểm tra (review)"*.
  - Đang `review` mà tụt < 100% (do từ chối) → `in_progress`.
  - Chặn vòng lặp (`seen`), dừng khi gặp task `done`/đã xóa.
- Gọi trong `review_progress_report` sau khối xử lý trạng thái của chính task.

### Frontend (`tasks.$taskId.tsx`)
- `reviewProgressReportMutation` invalidate thêm: `task`, `subtasks`, `project-tasks`,
  `parent-task`, `gantt`, `project-dashboard` (trước đó thiếu `task` → **bug "duyệt
  nhưng tiến độ không cập nhật"** đã fix).

---

## 6. Gỡ hẳn `TaskProof` khỏi backend

Đã xóa: model (`TaskProof`/`TaskProofCreate`/`TaskProofPublic`) + relationship
`Task.proofs`, `User.proofs` + export; repo (`list_proofs`, `get_proof_or_404`,
`create_proof`, `update_proof`); service (`upload_proof`, `review_proof`,
`list_proofs`); routes (`/tasks/{id}/proofs...`); cập nhật scripts
(`wipe_tasks_keep_accounts`, `reset_saree_process_demo`,
`director_dashboard_demo_data`).

- `alembic/versions/0037_drop_taskproof.py`: `DROP TABLE IF EXISTS taskproof CASCADE`.

**Còn lại (tùy chọn):** client TS sinh sẵn (`frontend/src/client`) vẫn còn
`TaskProofPublic`/`uploadProof`/... — không dùng, không gây lỗi; sẽ biến mất khi
regenerate client từ OpenAPI mới.

---

## Migrations cần chạy
```bash
cd backend && .venv_backend/bin/alembic upgrade head
# 0036_progress_report_review  → thêm review + backfill approved
# 0037_drop_taskproof          → drop bảng taskproof
```

## Trạng thái kiểm tra
- Frontend: `tsc` pass; không thêm lỗi lint mới (chỉ còn nợ lint cũ của repo).
- Backend: `import app.models`, routes, service, repo chạy OK; không lỗi ruff mới.

## Luồng hoàn chỉnh sau refactor
Nhân viên nộp báo cáo con (ảnh hiện trường + GPS + %, trạng thái *chờ duyệt*) →
quản lý nhận thông báo → duyệt → % con tăng (chỉ approved) → rollup cha (trọng số
auto/đặt tay) đạt 100% → **cha tự sang `review`** → **quản lý cha nhận thông báo
"cần vào kiểm tra"** → lan tiếp lên cấp trên.

---

# Tính năng mới — Release 1.1 (2026-06-07)

---

## 7. Check-in / Check-out chấm công tại công trình

### Mục tiêu
Nhân viên chấm công vào/ra tại hiện trường bằng điện thoại (PWA). Toạ độ GPS được
xác thực phía server chống gian lận; ảnh bắt buộc vì thiết bị không thể phát hiện
giả lập GPS.

### Model: `AttendanceRecord` (`backend/app/models/attendance.py`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `user_id` / `project_id` / `work_date` | FK / date | Mỗi ngày, mỗi project 1 bản ghi |
| `check_in_at` | datetime (server-stamped) | Không tin đồng hồ thiết bị |
| `check_in_lat/lng` | float | Toạ độ lúc check-in |
| `check_in_accuracy_m` | float? | `coords.accuracy` của thiết bị |
| `check_in_distance_m` | float | Khoảng cách Haversine tới site |
| `check_in_valid` | bool | Trong bán kính cho phép? |
| `check_in_photo_url` | str | Ảnh chụp khuôn mặt/hiện trường |
| `check_out_*` | tương tự | Điền lúc ra ca |
| `work_hours` | float? | Tính khi check-out, giới hạn max shift |
| `is_capped` | bool | Quá max shift → cắt giờ |
| `is_auto_closed` | bool | Quên check-out → tự đóng để review |

### Tham số site location (`SiteLocationUpdate`)
Mỗi project có `site_lat`, `site_lng`, `site_radius_m` (10–5000 m). Lưu ở model
`Project`. Haversine distance được tính server-side tại thời điểm check-in/out.

### Quy tắc nghiệp vụ
- `check_in_at` / `check_out_at` stamped **bởi server**, không nhận từ client.
- Nếu đến cuối ca vẫn chưa check-out → `is_auto_closed = True`, cần review thủ công.
- `work_hours` được **giới hạn** theo max shift của dự án (tránh trả thêm giờ do
  quên check-out).

---

## 8. Kiểm tra vị trí khi nộp báo cáo tiến độ (check position)

### Mục tiêu
Một số công việc yêu cầu nhân viên phải **có mặt tại hiện trường** khi nộp báo cáo
(chống gian lận báo cáo từ xa). Cờ `requires_checkin` trên task bật kiểm tra này.

### Trường liên quan trên `Task` (`backend/app/models/task.py`)

| Trường | Mặc định | Ghi chú |
|---|---|---|
| `requires_checkin` | `False` | Bật → báo cáo phải kèm GPS |
| `checkin_lat` / `checkin_lng` | `None` | Điểm tham chiếu |
| `checkin_radius_m` | `150` | Bán kính chấp nhận (m) |

### Trường liên quan trên `TaskProgressReport`

| Trường | Ghi chú |
|---|---|
| `checkin_skipped` | Nhân viên bỏ qua kiểm tra vị trí (quản lý có thể cho phép) |
| `distance_m` | Khoảng cách từ vị trí nộp tới `checkin_lat/lng` |
| `location_valid` | `True` nếu `distance_m ≤ checkin_radius_m` |

### Luồng
1. Khi task có `requires_checkin = True`, FE yêu cầu thiết bị cấp quyền GPS trước
   khi hiện form nộp báo cáo.
2. Toạ độ gửi lên cùng báo cáo; server tính `distance_m` và `location_valid`.
3. Nếu không hợp lệ và không được phép `checkin_skipped` → server trả 422.
4. Kết quả lưu trong bản ghi, hiển thị trên card báo cáo (badge "Đúng vị trí" /
   "Ngoài phạm vi X m").

---

## 9. Cây công việc con 5 tầng + UI mới

### Mục tiêu
Hỗ trợ cấu trúc WBS sâu tối đa 5 cấp (task gốc → sub1 → sub2 → sub3 → sub4) với
trọng số tự chia đều và rollup lên cả chuỗi cha.

### Backend

**Rollup đệ quy** (`_rollup_completion_pct` trong `task_service.py`):
```
Tổng(task) = SelfPart + ChildPart
  SelfPart  = (sum_approved_progress / 100) × W_report / 100
  ChildPart = Σ child_pct(i) × W_i / 100
  W_report  = max(0, 100 − ΣW_i)
```
- `W_i = null` → auto: `W_auto = (100 − explicit_total) / count_null`
- Có ≥1 con auto → `W_report = 0` → cha không tự nộp báo cáo được.

**Lan tiến độ lên cha** (`_propagate_completion_up`):
- Sau mỗi `review_progress_report`, đi ngược toàn bộ chuỗi cha (up to 5 cấp).
- Đạt 100% → set `review` + notify `assignor_id`.
- Tụt < 100% khi đang `review` → `in_progress`.
- Tránh vòng lặp bằng `seen = set()`.

**Chặn API nộp báo cáo ở cha** (422) khi các con phủ hết trọng số.

### Frontend (`tasks.$taskId.tsx`)

**Tính trọng số hiệu lực:**
```ts
const explicitTotal = subtaskRows.reduce((s, t) => s + (t.progress_weight ?? 0), 0)
const autoCount = subtaskRows.filter(t => t.progress_weight == null).length
const autoWeight = autoCount > 0 ? Math.max(0, 100 - explicitTotal) / autoCount : 0
// effectiveWeightById: id → explicit ?? autoWeight
```

**UI cây task con:**
- Mỗi subtask card hiển thị: "đóng góp X/100% (tự chia)" khi weight null.
- Khi `wReport === 0`: ẩn form nộp, hiện chú thích "tiến độ tính hoàn toàn từ
  công việc con".
- Subtask lồng nhau render đệ quy tối đa 5 cấp (cấp sâu hơn bị rút gọn).

**Thanh tiến độ tổng hợp:**
- "Đã duyệt X/100% · chờ duyệt Y% · Chỉ % đã duyệt mới được tính…"
- `selfProgress` = sum approved; `submittedProgress` = approved + pending.
- `maxRemainingProgress = 100 − submittedProgress` → giới hạn ô nhập %.

---

## Tổng quan kiến trúc tích hợp

```
Nhân viên (PWA)
  │ Check-in: GPS + ảnh → AttendanceRecord (valid?)
  │ Nộp báo cáo task con: GPS + ảnh + % → TaskProgressReport (pending)
  ↓
Quản lý nhận thông báo "chờ duyệt"
  │ Duyệt → review_status = approved
  ↓
Rollup task con → cha (auto-weight, đệ quy 5 cấp)
  │ Đạt 100% → cha sang `review`
  ↓
Quản lý cha nhận thông báo "cần kiểm tra"
  │ Duyệt cha → lan tiếp lên ông/cụ
  ↓
Task gốc `done`
```

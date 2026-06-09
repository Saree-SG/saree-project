# Kế hoạch triển khai các tính năng còn thiếu — Saree ERP

> Đối chiếu theo tài liệu **"QUY TRÌNH SẢN XUẤT 2.docx"**.
> Ngày lập: 2026-06-04.

## 0. Tổng quan & nguyên tắc

### 0.1 Trạng thái hiện tại (kết quả verify)

| # | Yêu cầu | Trạng thái | Việc cần làm |
|---|---|---|---|
| 1 | Năng suất tổ/cá nhân (giờ công, tỷ lệ HT, hiệu suất) | ⚠️ Một phần | Thêm giờ công + dashboard theo tháng |
| 2 | Chấm công công trình (giờ đến/về, GPS) | ❌ Thiếu | Làm mới — Phase 1.1 |
| 3 | Báo cáo công việc hàng ngày kèm ảnh | ✅ Đã có | (đã có `TaskProgressReport`) |
| 4 | Upload file/bản vẽ/ảnh trong chat | ✅ Đã có | (đã có `ChatAttachment`) |
| 5 | 1 tổ trưởng/bộ phận dùng app | ⚠️ Một phần | Thêm ràng buộc — Phase 2.3 |
| 6 | Dashboard hiệu suất tại công trình (thi đua) | ⚠️ Một phần | Mở rộng — Phase 2.1 |
| 7 | Log sự cố thi công + nguyên nhân + giải pháp (KB) | ❌ Thiếu | Làm mới — Phase 1.3 |
| 8 | Thông báo riêng cho GĐ từ chat + cả team | ❌ Thiếu | Mở rộng chat — Phase 1.4 |
| 9 | Quản lý đội ngoại lực + hợp đồng phụ + thanh toán | ❌ Thiếu | Làm mới — Phase 1.2 |
| 10 | Phân tích thắng/thua báo giá + nguyên nhân | ⚠️ Một phần | Mở rộng — Phase 2.2 |

### 0.2 Pipeline chuẩn cho mỗi module (theo kiến trúc hiện có)

1. **Model** — thêm file `backend/app/models/<name>.py`, đăng ký trong `models/__init__.py`.
2. **Migration** — `backend/app/alembic/versions/00XX_*.py` (tiếp số sau `0030_login_history`).
3. **Permission** — thêm code vào `ALL_PERMISSIONS` và `ROLE_PERMISSION_MAP` trong `backend/app/scripts/seed_defaults.py`.
4. **Service** — `backend/app/services/<name>_service.py` (business logic).
5. **Route** — `backend/app/api/routes/<name>.py`, đăng ký `api_router.include_router(...)` trong `backend/app/api/main.py`.
6. **Frontend API** — `frontend/src/modules/<feature>/<feature>Api.ts`.
7. **Frontend route** — `frontend/src/routes/_layout/<feature>.tsx`, thêm vào `frontend/src/config/layoutNav.ts` + bọc `PermissionGuard`.
8. **Test** — backend `backend/tests/`, cập nhật `docs/plan/test_case`.

### 0.3 Thứ tự thực hiện

- **Phase 1** (4 module thiếu hoàn toàn — độc lập, làm song song): 1.1, 1.2, 1.3, 1.4
- **Phase 2** (mở rộng): 2.1 (phụ thuộc 1.1), 2.2, 2.3
- **Phase 3** (cần chốt scope với khách): Module Sản xuất, Luồng vật tư nâng cao

---

## PHASE 1 — Tính năng thiếu hoàn toàn (ưu tiên cao)

### 1.1 — Module Chấm công công trình (Attendance + GPS)

**Mục tiêu:** Thợ check-in/check-out tại công trình; bắt buộc đúng vị trí (GPS trong bán kính công trình), tính giờ công, chống chấm công tại nhà.

#### Model — `backend/app/models/attendance.py`
```python
class AttendanceRecord(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    project_id: uuid.UUID = Field(foreign_key="project.id", index=True)
    work_date: date = Field(index=True)              # phục vụ truy vấn theo ngày

    check_in_at: datetime
    check_in_lat: float
    check_in_lng: float
    check_in_distance_m: float                       # khoảng cách tới site
    check_in_valid: bool                             # trong bán kính?

    check_out_at: datetime | None = None
    check_out_lat: float | None = None
    check_out_lng: float | None = None
    check_out_distance_m: float | None = None

    work_hours: float | None = None                  # tính khi check-out
    note: str | None = Field(default=None, sa_type=Text)
    created_at: datetime = Field(default_factory=_utcnow, sa_type=DateTime(timezone=True))
```

#### Alter `Project` (cùng migration) — thêm tọa độ công trình
- `site_lat: float | None`
- `site_lng: float | None`
- `site_radius_m: int = 200` (bán kính cho phép, mặc định 200m)

#### Migration — `0031_add_attendance_module.py`
- Tạo bảng `attendancerecord` + 3 cột mới ở `project`.

#### Service — `backend/app/services/attendance_service.py`
- `haversine(lat1, lng1, lat2, lng2) -> mét`.
- `check_in(user, project_id, lat, lng)`:
  - Lấy `site_lat/lng/radius` của project; nếu chưa cấu hình → cho phép nhưng đánh dấu `check_in_valid=False` + cảnh báo.
  - Tính khoảng cách; `valid = distance <= radius`.
  - Chặn nếu đã có record cùng `work_date` chưa check-out.
- `check_out(record_id, lat, lng)`: tính `work_hours = (check_out_at - check_in_at) / 3600`.

#### Permission (seed_defaults.py)
| code | scope | mô tả |
|---|---|---|
| `ATTENDANCE_CHECKIN` | own | Chấm công cá nhân |
| `ATTENDANCE_VIEW_TEAM` | team | Xem chấm công tổ/phòng |
| `ATTENDANCE_VIEW_ALL` | global | Xem toàn bộ chấm công |
| `ATTENDANCE_CONFIG_SITE` | project | Cấu hình tọa độ công trình |

- Map: `installer`, `worker`, `workshop_lead` → `ATTENDANCE_CHECKIN`. `department_head`, `director`, `admin` → `*_VIEW_ALL` + `CONFIG_SITE`.

#### Routes — `backend/app/api/routes/attendance.py`
- `POST /attendance/check-in` body `{project_id, lat, lng}`
- `POST /attendance/check-out` body `{record_id, lat, lng}`
- `GET /attendance/me?from&to`
- `GET /attendance/project/{project_id}?date`
- `PATCH /projects/{id}/site-location` (set tọa độ + bán kính)

#### Frontend
- `modules/attendance/attendanceApi.ts`.
- `routes/_layout/attendance.tsx`: nút Check-in/Check-out dùng `navigator.geolocation.getCurrentPosition`, hiển thị trạng thái "✅ Đúng vị trí" / "⚠️ Lệch X m". Lịch sử chấm công trong ngày/tháng.
- Trong `projects.$projectId.tsx`: form set tọa độ công trình (chọn trên map hoặc nhập lat/lng).
- Thêm nav item "Chấm công".

---

### 1.2 — Module Quản lý đội ngoại lực / thầu phụ

**Mục tiêu:** Quản lý đội thuê ngoài (bọc cách nhiệt, lắp panel kho lạnh), hợp đồng phụ, theo dõi thanh toán riêng.

#### Model — `backend/app/models/subcontractor.py`
```python
class Subcontractor(SQLModel, table=True):
    id: uuid.UUID = ...
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    name: str
    specialty: str           # insulation | cold_room_panel | other
    contact_person: str | None
    phone: str | None
    note: str | None
    is_active: bool = True
    created_at: datetime

class SubcontractorAssignment(SQLModel, table=True):
    id: uuid.UUID = ...
    subcontractor_id: uuid.UUID = Field(foreign_key="subcontractor.id", index=True)
    project_id: uuid.UUID = Field(foreign_key="project.id", index=True)
    scope: str               # mô tả phần việc giao
    agreed_amount: Decimal   # giá trị hợp đồng phụ
    status: str = "active"   # active | completed | cancelled
    start_date: date | None
    end_date: date | None
    created_at: datetime

class SubcontractorPayment(SQLModel, table=True):
    id: uuid.UUID = ...
    assignment_id: uuid.UUID = Field(foreign_key="subcontractorassignment.id", index=True)
    milestone: str           # mô tả đợt thanh toán
    amount: Decimal
    status: str = "pending"  # pending | paid
    due_date: date | None
    paid_at: datetime | None
    note: str | None
    created_at: datetime
```

#### Migration — `0032_add_subcontractor_module.py`
- 3 bảng mới.

#### Permission
| code | mô tả |
|---|---|
| `SUBCONTRACTOR_VIEW` | Xem đội ngoại lực |
| `SUBCONTRACTOR_MANAGE` | Thêm/sửa đội + gán dự án |
| `SUBCONTRACTOR_PAYMENT` | Quản lý thanh toán |
- Map chủ yếu cho `director`, `department_head`, `planner`, `site_supply`.

#### Service — `subcontractor_service.py`
- CRUD + tổng hợp công nợ (đã thanh toán / còn lại) theo assignment & project.

#### Routes — `api/routes/subcontractors.py`
- `GET/POST /subcontractors`, `GET/PATCH /subcontractors/{id}`
- `POST /subcontractors/{id}/assignments`, `GET /projects/{id}/subcontractors`
- `POST/GET /assignments/{id}/payments`, `PATCH /payments/{id}` (đánh dấu đã trả)

#### Frontend
- `modules/subcontractor/subcontractorApi.ts`
- `routes/_layout/subcontractors.index.tsx` (danh sách + filter theo specialty), `subcontractors.$id.tsx` (chi tiết: assignments + bảng thanh toán + công nợ).
- Tab "Đội ngoại lực" trong `projects.$projectId.tsx`.
- Nav item "Đội ngoại lực".

---

### 1.3 — Module Log sự cố thi công + Knowledge Base

**Mục tiêu:** Ghi nhận lỗi/sự cố thi công kèm nguyên nhân + giải pháp + ảnh; tra cứu lại cho lần sau (KB).

#### Model — `backend/app/models/incident.py`
```python
class Incident(SQLModel, table=True):
    id: uuid.UUID = ...
    company_id: uuid.UUID = Field(foreign_key="company.id", index=True)
    project_id: uuid.UUID | None = Field(foreign_key="project.id", index=True)
    task_id: uuid.UUID | None = Field(foreign_key="task.id")
    title: str
    description: str = Field(sa_type=Text)
    category: str            # electrical | welding | conveyor | cooling | insulation | other
    severity: str = "medium" # low | medium | high
    root_cause: str | None = Field(sa_type=Text)   # nguyên nhân
    solution: str | None = Field(sa_type=Text)      # giải pháp khắc phục
    status: str = "open"     # open | resolved
    reported_by: uuid.UUID = Field(foreign_key="user.id")
    resolved_by: uuid.UUID | None = Field(foreign_key="user.id")
    resolved_at: datetime | None
    created_at: datetime

class IncidentAttachment(SQLModel, table=True):
    id: uuid.UUID = ...
    incident_id: uuid.UUID = Field(foreign_key="incident.id", index=True)
    file_url: str
    file_type: str = "image"
    uploaded_at: datetime
```

#### Migration — `0033_add_incident_module.py`

#### Permission
| code | mô tả |
|---|---|
| `INCIDENT_CREATE` | Ghi nhận sự cố |
| `INCIDENT_VIEW` | Xem/tra cứu sự cố (KB) |
| `INCIDENT_RESOLVE` | Cập nhật nguyên nhân/giải pháp, đóng |
- Map: tất cả nhân sự thi công có `INCIDENT_CREATE` + `INCIDENT_VIEW`; `workshop_lead`/`department_head`/`engineer` có `INCIDENT_RESOLVE`.

#### Service — `incident_service.py`
- CRUD + upload ảnh (dùng `shared/storage.py` như `TaskProof`).
- Tìm kiếm KB: filter theo `category`, full-text trên `title/description/solution`.

#### Routes — `api/routes/incidents.py`
- `GET/POST /incidents` (+ filter `category`, `project_id`, `status`, `q`)
- `GET/PATCH /incidents/{id}`, `POST /incidents/{id}/resolve`
- `POST /incidents/{id}/attachments` (upload ảnh)

#### Frontend
- `modules/incident/incidentApi.ts`
- `routes/_layout/incidents.index.tsx` (danh sách + ô tìm kiếm KB + lọc category), `incidents.$id.tsx` (chi tiết + form nguyên nhân/giải pháp + gallery ảnh).
- Nút "Báo sự cố" trong `tasks.$taskId.tsx` và `projects.$projectId.tsx`.
- Nav item "Sự cố / KB".

---

### 1.4 — Thông báo riêng cho Giám đốc từ chat (+ gửi cả team)

**Mục tiêu:** Trong chat dự án, người gửi có thể đánh dấu "báo riêng GĐ" — tin nhắn vẫn hiện cho cả team, đồng thời tạo notification riêng cho tất cả Giám đốc.

#### Thay đổi Model — `models/chat.py`
- `ChatMessage`: thêm `notify_director: bool = False`, `is_alert: bool = False`.

#### Migration — `0034_chat_director_alert.py`
- Thêm 2 cột vào `chatmessage`.

#### Service — mở rộng `chat` service
- Khi `notify_director=True`: query tất cả user có role `director` trong company của room → tạo `Notification(type="director_alert", entity_type="chat", entity_id=room_id, title=..., body=preview)` cho mỗi người. Bắn qua WebSocket notification nếu có.
- Message vẫn lưu & broadcast bình thường trong room (gửi cả team).

#### Routes
- Tận dụng `POST /chat/rooms/{room_id}/messages` — thêm field optional `notify_director` trong body schema.
- Notification list dùng `api/routes/notifications.py` sẵn có (lọc thêm `type=director_alert`).

#### Permission
- `CHAT_NOTIFY_DIRECTOR` (gán cho `workshop_lead`, `installer`, `department_head`...). Không cần nếu cho phép mọi member.

#### Frontend — `chat.tsx`
- Checkbox/nút "🔔 Báo riêng Giám đốc" cạnh ô nhập tin.
- Badge "ALERT" trên message có `is_alert`.
- Trong dropdown notification: nhóm/biểu tượng riêng cho `director_alert`.

---

## PHASE 2 — Mở rộng phần đã có một phần

### 2.1 — Tổng giờ công + Dashboard năng suất theo tháng

**Phụ thuộc:** 1.1 (dữ liệu giờ công).

#### Backend — mở rộng `api/routes/dashboard.py`
- `GET /dashboard/team-productivity?period=month&department_id=&from=&to=`
  - Tổng hợp theo tổ/department: tổng giờ công (từ `AttendanceRecord.work_hours`), số task hoàn thành, tỷ lệ HT, tỷ lệ trễ hạn, hiệu suất (task hoàn thành / giờ công).
- `GET /dashboard/site-performance?project_id=`
  - Chiều "tại công trình": điểm thi đua cá nhân/đội = hàm số (đúng hạn, số sự cố gây ra từ `Incident.reported_by`/liên quan, giờ công).
- Trả cấu trúc sẵn cho biểu đồ (mảng theo tháng/tổ/người).

#### Frontend
- `dashboard.personnel.$userId.tsx`: thêm card "Tổng giờ công tháng" + biểu đồ năng suất theo tháng.
- `reports.tsx`: bộ lọc tháng/tổ + bảng xếp hạng thi đua (cơ sở khen thưởng cuối năm).

---

### 2.2 — Phân tích tỷ lệ thắng/thua báo giá + nguyên nhân thất bại

#### Backend — `models/quotation.py` + `quotation_service.py`
- Khi đóng hồ sơ (S9, đã có `QUOTATION_CLOSE`): thêm field `lost_reason: str | None` (enum `marketing | design | price | other`) + `lost_note: str | None`. (Migration alter `quotation`.)
- `GET /quotations/reports/win-loss?group_by=client|period|equipment`
  - Trả: tổng số chào giá, số thắng, số thua, tỷ lệ thắng, phân bố nguyên nhân thất bại.

#### Frontend — `quotations.reports.tsx`
- Biểu đồ win/loss (pie/bar) + bảng phân tích nguyên nhân thất bại theo nhóm.
- Khi đóng hồ sơ "lost": bắt buộc chọn `lost_reason`.

---

### 2.3 — Ràng buộc "1 tổ trưởng / bộ phận dùng app"

#### Backend — `services` (gán role) trong `roles` flow
- Khi gán role leader (`workshop_lead` hoặc role có cờ `is_leader`) cho user trong 1 department:
  - Kiểm tra department đó đã có user active mang role leader chưa → nếu có, trả lỗi 409 "Bộ phận đã có tổ trưởng".
- (Tùy chọn) thêm cờ `is_leader: bool` vào `Role` để tổng quát hóa, hoặc hardcode danh sách leader-role.

#### Frontend — `admin.organization.tsx` / màn gán role
- Hiển thị tổ trưởng hiện tại của mỗi department; cảnh báo khi cố gán trùng.

---

## PHASE 3 — Cần chốt scope với khách (đề xuất, chưa triển khai)

### 3.1 Module Sản xuất đầy đủ
- `ProductionPlan`, `ProductionOrder`, phân bổ tổ, work center; mở rộng từ `Task.module_tag="production"`.
- Phòng kế hoạch lập lịch SX, phân bổ nhân sự giữa các tổ.

### 3.2 Luồng vật tư nâng cao
- `SupplierQuote` (so sánh 3 nhà cung cấp) + duyệt BGĐ → đặt hàng.
- `TransportPlan` (kế hoạch vận chuyển vật tư tới công trình: số xe, giá thuê, tuyến đường, duyệt).
- Mở rộng từ `MaterialIssue` / `InventoryItem` hiện có.

---

## Phụ lục — Danh sách file dự kiến tạo/sửa

**Backend tạo mới:**
- `models/attendance.py`, `models/subcontractor.py`, `models/incident.py`
- `services/attendance_service.py`, `services/subcontractor_service.py`, `services/incident_service.py`
- `api/routes/attendance.py`, `api/routes/subcontractors.py`, `api/routes/incidents.py`
- `alembic/versions/0031..0035_*.py`

**Backend sửa:**
- `models/__init__.py`, `models/chat.py`, `models/project.py`, `models/quotation.py`
- `api/main.py` (đăng ký router), `api/routes/dashboard.py`, `api/routes/quotations.py`, `api/routes/chat.py`
- `scripts/seed_defaults.py` (permissions + role map)
- `services/chat_service.py`, `services/quotation_service.py`

**Frontend tạo mới:**
- `modules/attendance/`, `modules/subcontractor/`, `modules/incident/`
- `routes/_layout/attendance.tsx`, `subcontractors.index.tsx`, `subcontractors.$id.tsx`, `incidents.index.tsx`, `incidents.$id.tsx`

**Frontend sửa:**
- `config/layoutNav.ts`, `chat.tsx`, `projects.$projectId.tsx`, `tasks.$taskId.tsx`, `dashboard.personnel.$userId.tsx`, `reports.tsx`, `quotations.reports.tsx`, `admin.organization.tsx`

# Inventory Module & Feature — Saree ERP

Tài liệu này tổng hợp nhanh **module** và **feature hiển thị trên UI** dựa trên cấu trúc source hiện tại (frontend routes/menu + backend API routes/services/repositories/models).

## Định nghĩa & cách đếm

- **Module (domain module)**: nhóm nghiệp vụ theo domain (ví dụ `quotation`, `contract`, `tasks`, …) thể hiện qua:
  - Frontend: thư mục con trong `frontend/src/modules/`
  - Backend: model/service/repository/API route liên quan đến domain đó
- **Feature show ra (UI feature)**: một “khối chức năng” người dùng nhìn thấy và thao tác được trên màn hình. Ví dụ: *bộ lọc*, *bảng danh sách*, *timeline lịch sử*, *upload tài liệu*, *wizard tạo mới*, *workflow actions*, *biểu đồ báo cáo*, …
- **Route/page**: một màn hình (file route) trong `frontend/src/routes/`.

> Lưu ý: “Feature” có thể đếm theo 2 mức:
> - **Feature lớn** (khuyến nghị): gộp các thao tác nhỏ cùng một cụm UI.
> - **Feature chi tiết**: tách riêng từng dialog/action/biến thể trạng thái.
>
> Trong tài liệu này, phần thống kê sẽ ưu tiên **feature lớn**, nhưng vẫn liệt kê **feature con** khi cần.

---

## 1) Thống kê module

### 1.1 Frontend domain modules (`frontend/src/modules/`)

**13 module**:

- `auth`
- `rbac`
- `org`
- `tasks`
- `project`
- `gantt`
- `quotation`
- `contract`
- `procurement`
- `inventory`
- `supplier`
- `chat`
- `notifications`

### 1.2 Backend modules (theo layer)

- **API routes** (`backend/app/api/routes/*.py`): **17**
  - `login`, `users`, `roles`, `projects`, `tasks`, `task_ws`
  - `procurement`, `inventory`, `suppliers`
  - `quotations`, `contracts`
  - `chat`, `chat_ws`, `notifications`
  - `dashboard`, `utils`, `private`
- **Services** (`backend/app/services/*.py`, không tính `__init__.py`): **11**
- **Repositories** (`backend/app/repositories/*.py`, không tính `__init__.py`): **11**
- **Models** (`backend/app/models/*.py`): **14**

---

## 2) Danh mục màn hình (routes)

Tổng số file route trong `frontend/src/routes`: **33**.

### 2.1 Nhóm Auth

- `/login`
- `/signup`
- `/recover-password`
- `/reset-password`

### 2.2 Nhóm core (layout)

- **Tổng quan**: `/`
- **Công việc**: `/tasks`, `/tasks/$taskId`
- **Dự án**: `/projects`, `/projects/$projectId`
- **Báo giá**: `/quotations`, `/quotations/new`, `/quotations/$quotationId`, `/quotations/reports`
- **Hợp đồng**: `/contracts`, `/contracts/new`, `/contracts/$contractId`
- **Mua hàng**: `/procurement`, `/procurement/requests/$requestId`, `/procurement/orders/$poId`
- **Kho hàng**: `/inventory`, `/inventory/items/$itemId`, `/inventory/issues/$issueId`
- **Nhà cung cấp**: `/suppliers`, `/suppliers/$supplierId`
- **Chat**: `/chat`
- **Quản lý công ty**: `/company`
- **Admin**: `/admin`
- **Cài đặt**: `/settings`
- **Reports**: `/reports`
- **Items**: `/items`
- **Dashboard nhân sự**: `/dashboard/personnel/$userId`

---

## 3) Inventory feature theo nhóm (feature lớn)

Phần dưới đây trả lời câu hỏi “**có bao nhiêu feature show ra**” theo 4 nhóm bạn yêu cầu:
**Hợp đồng**, **Báo giá**, **Task management**, **Tổng quan**.

### 3.1 Hợp đồng (Contracts)

**Routes**

- Danh sách: `/contracts`
- Tạo mới: `/contracts/new`
- Chi tiết: `/contracts/$contractId`

**Feature lớn đang show ra (ước lượng ~16 feature lớn)**

#### A) Danh sách hợp đồng (`/contracts`)

- **Phân quyền vào trang**: yêu cầu `CONTRACT_VIEW` hoặc `CONTRACT_VIEW_ALL`
- **Tạo hợp đồng** (nút): yêu cầu `CONTRACT_CREATE`
- **Lọc trạng thái**: dropdown trạng thái
- **Bảng danh sách**:
  - Số HĐ (link sang chi tiết)
  - Ngày ký
  - Giá trị
  - Tạm ứng
  - Trạng thái (badge màu)

#### B) Tạo hợp đồng (`/contracts/new`)

- **Chọn báo giá thắng** (lọc bỏ báo giá đã có hợp đồng)
- **Tự set giá trị hợp đồng** theo báo giá khi chọn
- **Form**: ngày hợp đồng, tiền tệ, giá trị, tạm ứng, ghi chú
- **Validate**: yêu cầu quotation + ngày + total_value > 0

#### C) Chi tiết hợp đồng (`/contracts/$contractId`)

- **Stepper trạng thái** (`StatusStepper`)
- **Hướng dẫn bước tiếp theo theo trạng thái** (`NextStepsGuide`)
- **Workflow actions** (tùy trạng thái + quyền):
  - `submit` (nộp BGĐ duyệt) — `CONTRACT_SUBMIT`
  - `approve` / `reject` — `CONTRACT_APPROVE`
  - `sign` — `CONTRACT_SIGN`
  - `confirm_advance` — `CONTRACT_CONFIRM_ADVANCE`
  - `start_production` — `CONTRACT_START_PRODUCTION`
  - `complete` — `CONTRACT_COMPLETE`
- **Ghi chú rich text** cho mỗi action (title + editor) và **đính kèm theo phase**
- **Thông tin hợp đồng**: số, ngày, giá trị, tiền tệ, tạm ứng, ngày nhận tạm ứng, ghi chú
- **Quản lý file đính kèm**:
  - Danh sách file + icon loại file
  - Xem ảnh inline (preview) / download file thường
  - Upload file (yêu cầu `CONTRACT_UPDATE`)
  - Xóa file (yêu cầu `CONTRACT_UPDATE`)
- **Lịch sử thay đổi**:
  - Timeline lịch sử + attachment theo bước
  - Lọc timeline theo bước (click stepper + “Bỏ lọc”)

---

### 3.2 Báo giá (Quotation)

**Routes**

- Danh sách: `/quotations`
- Tạo mới: `/quotations/new`
- Chi tiết: `/quotations/$quotationId` (tabs)
- Báo cáo: `/quotations/reports`

**Feature lớn đang show ra (ước lượng ~27 feature lớn)**

#### A) Danh sách báo giá (`/quotations`)

- **Phân quyền vào trang**: `QUOTATION_VIEW` hoặc `QUOTATION_VIEW_ALL`
- **Tạo báo giá** (nút): `QUOTATION_CREATE`
- **Đi tới báo cáo** (nút): `/quotations/reports`
- **Bộ lọc**:
  - Tìm theo **tên công ty khách hàng**
  - Lọc theo **hạng mục thiết bị**
  - Lọc theo **trạng thái**
  - Lọc theo **giai đoạn**
  - Xóa filter
- **Bảng danh sách**:
  - Mã báo giá (link chi tiết)
  - Tên dự án, khách hàng, hạng mục
  - Badge trạng thái + badge giai đoạn
  - Giá bán (VND)
  - Ngày tạo
  - Badge “Việc của tôi” (khi stage là “my turn” theo quyền)
- **Pagination**

#### B) Tạo báo giá (`/quotations/new`)

- **Wizard 2 bước**
  - Bước 1: thông tin công ty khách hàng (chọn công ty cũ hoặc tạo mới)
  - Bước 2: thông tin khảo sát & dự án
- **Company profiles**:
  - load danh sách công ty đã có
  - apply profile (auto-fill các field)
- **Form fields**: liên hệ, địa chỉ khảo sát, ghi chú, tên dự án, hạng mục thiết bị…
- **Thông tin hướng dẫn** sau tạo (gợi ý flow)

#### C) Chi tiết báo giá (`/quotations/$quotationId`)

- **Hiển thị quy trình**: `StageStepper` + “nội dung nộp” theo bước + file theo bước
- **Action panel thao tác workflow**: `QuotationActionsPanel` (tùy stage/quyền)
- **Tabs**:
  - **Tổng quan**:
    - Banner outcome (won/lost) + lý do thua
    - Khối thông tin khách hàng
    - Khối phụ trách (sales/tech/procurement)
    - Khối tài chính + **ẩn/hiện giá**
    - Khối mốc thời gian
    - Ghi chú
  - **Trao đổi với khách**:
    - Form thêm log thương lượng (ngày, hình thức, tóm tắt, feedback, follow-up)
    - Danh sách logs thương lượng
  - **Tài liệu**:
    - Upload nhiều file
    - Thư viện tài liệu theo nhóm (khảo sát/thiết kế/định giá/chào giá/khác)
    - Hiển thị version + badge “Được duyệt” (nếu là approved version)
  - **Lịch sử**:
    - Timeline lịch sử chuyển bước + attachment
    - Lọc theo bước (filter history) + bỏ lọc
- **Dialog thao tác workflow**: hiển thị form theo action (tùy action sẽ có thêm field)

#### D) Báo cáo báo giá (`/quotations/reports`)

- **Bộ lọc**: từ ngày/đến ngày/hạng mục/khách hàng + áp dụng/xóa
- **Summary cards**
- **Highlight tổng giá trị thắng**
- **Biểu đồ**:
  - Bar chart theo hạng mục
  - Pie chart phân tích nguyên nhân thua
- **Bảng thống kê**:
  - Theo khách hàng
  - Theo hạng mục thiết bị

---

### 3.3 Task management

**Routes**

- Công việc của tôi: `/tasks`
- Chi tiết: `/tasks/$taskId`

**Feature lớn đang show ra (ước lượng ~25 feature lớn)**

#### A) Công việc của tôi (`/tasks`)

- **Dashboard “My tasks”** chia theo band:
  - Quá hạn nghiêm trọng
  - Đã quá hạn
  - Sắp đến hạn (trong 24h)
  - Hôm nay
  - Đang thực hiện
- **Task card**:
  - trạng thái (computed)
  - tiến độ (progress bar)
  - deadline text (còn x giờ / còn x ngày / quá hạn…)
  - collaborator avatars + số người
  - nhãn nghiệp vụ theo `module_tag`/linked entity
- **Queues liên quan nghiệp vụ khác** (tùy quyền):
  - Báo giá cần xử lý
  - Yêu cầu mua hàng cần duyệt
  - Hợp đồng chờ phê duyệt
  - PO cần xử lý

#### B) Chi tiết task (`/tasks/$taskId`)

- **Realtime**: websocket trạng thái “Trực tiếp”
- **Phân loại nghiệp vụ**: hiển thị & chỉnh `module_tag` (nếu có quyền)
- **Linked entities**: mở PR / Issue (inventory) đã liên kết
- **Tạo nghiệp vụ từ task**:
  - dialog chọn: tạo PR hoặc tạo phiếu xuất kho
- **Breadcrumb**: task cha / task con + banner “Công việc con” + weight contribution
- **Header task**:
  - đổi thời gian (dialog)
  - menu sửa thông tin task (dialog)
- **Blocked by**: danh sách task đang chặn
- **Dependency**: thêm/xóa task phụ thuộc trước
- **Đổi trạng thái**: `todo / in_progress / done` (done yêu cầu progress đạt 100%)
- **Yêu cầu gia hạn**:
  - xin gia hạn (dialog)
  - duyệt/từ chối gia hạn theo quyền
- **Người thực hiện & giao việc**:
  - phối hợp (extra assignees): thêm/gỡ
  - observer: thêm/gỡ
  - đổi phụ trách chính
- **Mô tả công việc**
- **Công việc con**:
  - danh sách + progress + weight
  - thêm công việc con (dialog)
- **Tiến độ chung**:
  - progress bar + breakdown child vs direct
  - gửi báo cáo tiến độ bằng **ảnh hiện trường** + % + ghi chú
  - danh sách progress reports + xem ảnh lightbox
- **Bằng chứng hoàn thành**:
  - nộp bằng chứng (URL + note)
  - review proof: duyệt / từ chối + dialog ghi chú từ chối
- **Thảo luận**: chat-like input + list
- **Lịch sử audit**: log timeline theo hành động

---

### 3.4 Tổng quan (Dashboard)

**Route**

- `/` (layout index)

**Feature lớn đang show ra (ước lượng ~13 feature lớn)**

- **Gating quyền vào dashboard** (không đủ quyền sẽ redirect sang `/tasks`)
- **Filters**:
  - lọc theo dự án
  - lọc theo phòng ban
- **KPI cards** (click để scroll đến section):
  - tổng dự án
  - task hoàn thành / tổng task
  - cảnh báo dự án
  - tỷ lệ hoàn thành + progress bar
- **Widget báo giá chờ xử lý** (top N + link “xem tất cả”)
- **Widget mua hàng cần xử lý**
- **Cảnh báo dự án**:
  - lọc mức cảnh báo (critical/warning/watch)
  - bảng dự án + task gần nhất + mức cảnh báo + deadline
- **Danh sách dự án**:
  - search theo tên
  - tabs: tất cả / đang thực hiện / chưa bắt đầu / hoàn thành
  - bảng thống kê + progress
- **Phân bổ nguồn lực (Workload)**:
  - search theo tên
  - lọc phòng ban
  - lọc mức độ (high/medium/low)
  - progress bar theo % workload
- **Hiệu suất nhân sự (Leaderboard)**:
  - top hoàn thành task
  - link sang `/dashboard/personnel/$userId`
- **Tạo dự án mới (dialog)**:
  - nhập tên dự án
  - chọn thành viên tham gia (search + multi-select)

---

## 4) Gợi ý chuẩn hóa “feature list” để quản lý sản phẩm

Nếu bạn muốn biến tài liệu này thành “danh mục sản phẩm” phục vụ roadmap/QA, đề xuất format:

- **Feature code**: ví dụ `QT-LIST-FILTER`, `CT-WF-APPROVE`, `TS-PROGRESS-REPORT`
- **Route**: nơi hiển thị
- **Actors/Role**: ai thấy
- **Permissions**: quyền kiểm soát
- **API endpoints**: map sang backend route (nếu cần)
- **Happy path + Edge cases**

Chỉ cần bạn nói “muốn format theo bảng + map quyền”, mình sẽ bổ sung thêm phần đó (và có thể xuất ra thành 1 file riêng).


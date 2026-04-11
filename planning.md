# Saree ERP — POC Plan & Full Product Roadmap

---

## PART 1 — POC (Proof of Concept) để demo cho khách hàng

### Mục tiêu POC

Thuyết phục khách hàng bằng cách demo **quy trình sản xuất tại nhà máy + lắp đặt công trình** theo đúng nghiệp vụ thực tế của họ:
- Giám đốc giao việc → Tổ trưởng triển khai → Thợ báo cáo → Giám đốc theo dõi real-time
- Chứng minh hệ thống giải quyết được bài toán: trễ tiến độ không kiểm soát được, không có bằng chứng công việc, giao tiếp rời rạc

---

### Hiện trạng (Backend ✅ / Frontend ❌)

| Feature | Backend | Frontend |
|---|---|---|
| Project CRUD, member management | ✅ | ✅ (project dashboard) |
| Task hierarchy (Giám đốc → Tổ trưởng → Thợ) | ✅ | ✅ (inline tạo task trong project) |
| Task status (todo → in_progress → review → done) | ✅ | ✅ (nút Pending/Working/Complete) |
| Progress report (ảnh + %) | ✅ | ✅ (trong task detail) |
| Proof upload + manager review | ✅ | ✅ (Evidence section) |
| Task comments / discussion | ✅ | ✅ (trong task detail) |
| Dashboard KPI tổng quan | ✅ | ✅ (index page) |
| Leaderboard hiệu suất | ✅ | ✅ |
| Chat group rooms + WebSocket | ✅ | ✅ |
| Chat file attachments | ✅ | ✅ |
| **Delay request UI** (xin gia hạn) | ✅ | ❌ |
| **Delay approval UI** (duyệt gia hạn) | ✅ | ❌ |
| **Task dependency** (A xong B mới chạy) | ✅ | ❌ |
| **Gantt / Timeline view** | ❌ | ❌ |
| **Kanban board** | ❌ | ❌ |
| **Task audit log UI** | ✅ backend | ❌ |
| **In-app notifications** | ❌ | ❌ |
| **Direct message (1-on-1)** | ✅ (room_type=direct) | ❌ |
| **Auto-create chat room cho project** | ❌ | ❌ |
| **Trang chat gắn với project** | ❌ | ❌ |
| **Mobile-friendly check-in view** | ❌ | ❌ |
| **Attendance / GPS check-in** | ❌ | ❌ |

---

### Các tính năng CẦN LÀM để POC đủ thuyết phục

#### 🔴 P0 — Bắt buộc (thiếu là demo fail)

**1. Delay Request & Approval Flow (Frontend)**
- Trong task detail: thêm nút "Xin gia hạn" → dialog nhập lý do + ngày mới
- Manager nhìn thấy pending requests → nút Duyệt / Từ chối
- Sau khi duyệt: deadline task tự cập nhật
- *Backend đã có đủ: `POST /tasks/{id}/comments` với `comment_type=delay_justification` + `PATCH /tasks/{id}/comments/{id}/approval`*

**2. Notification in-app (toasts / badge)**
- Khi task được assign → nhận thông báo
- Khi có delay request cần duyệt → manager nhận thông báo
- Khi proof bị reject → worker nhận thông báo
- Implement bằng WebSocket ping hoặc polling /tasks/my/dashboard
- *Không cần push notification cho POC — toast + badge đủ*

**3. Project-linked Chat Room**
- Khi tạo project → tự động tạo 1 group chat room cho project đó
- Trong project dashboard: thêm tab/button "Chat nhóm dự án" → navigate đến room đó
- *Backend: `POST /chat/rooms` + link room_id vào project metadata hoặc naming convention*

**4. Task Detail — hiển thị subtask tree**
- Hiện tại task detail chỉ show info của 1 task
- Cần thêm section "Công việc con" listing subtasks với status + assignee
- Click subtask → navigate đến subtask detail
- *Backend: `GET /projects/{id}/tasks?parent_id={id}` đã có*

#### 🟡 P1 — Quan trọng (có thì demo mượt hơn nhiều)

**5. Kanban Board cho Project**
- Trong `/projects/$projectId` thêm tab "Bảng Kanban"
- 4 cột: Chưa làm | Đang làm | Chờ duyệt | Hoàn thành
- Card task hiển thị: tên, assignee avatar, deadline, priority badge
- Drag-and-drop để đổi status (dùng `@dnd-kit/core`)
- *Backend: `PATCH /tasks/{id}/status` đã có*

**6. Direct Message (1-on-1 Chat)**
- Trong chat sidebar: section "Tin nhắn riêng" bên cạnh "Nhóm"
- Tạo DM từ profile user hoặc từ danh sách member của project
- *Backend: `POST /chat/rooms` với `room_type=direct` đã có*

**7. Task Conflict / Overdue Highlight rõ hơn trên Project Dashboard**
- Hiện tại project dashboard list task nhưng chưa highlight overdue rõ
- Thêm màu đỏ/vàng cho task trễ hạn
- Badge "Trễ X ngày" bên cạnh deadline
- Overdue count card clickable → filter task list

**8. Audit Log UI trong Task Detail**
- Tab "Lịch sử" trong task detail
- Timeline: ai làm gì, lúc nào (đổi status, upload proof, comment...)
- *Backend: `GET /tasks/{id}/audit` đã có*

#### 🟢 P2 — Nice-to-have (nếu có thời gian)

**9. Gantt Chart mini (read-only)**
- Không cần interactive drag
- Chỉ cần visualization: mỗi task = 1 bar trên timeline
- Thể hiện dependency arrows
- Thư viện: `dhtmlx-gantt` (free tier) hoặc `frappe-gantt`

**10. Mobile-responsive Task Detail**
- Tối ưu task detail page trên mobile (thợ dùng điện thoại báo cáo)
- Progress photo upload từ camera mobile
- Hiện tại đã có responsive nhưng cần kiểm tra UX trên mobile thực

**11. Dashboard — Filter theo phòng ban / tổ**
- Giám đốc muốn xem riêng tiến độ từng tổ sản xuất
- Thêm dropdown lọc Department trên dashboard
- *Backend: filter params đã có trong query*

---

### Demo Script cho POC

Thứ tự demo để tạo impact tối đa:

1. **Login Giám đốc** → Dashboard tổng quan (KPI, overdue, leaderboard)
2. **Tạo Project mới** → "Dự án lắp đặt kho lạnh ABC" → thêm thành viên các tổ
3. **Tạo task hierarchy**: Lắp đặt hệ thống → [Lắp đường ống, Lắp điện, Lắp băng chuyền]
4. **Switch sang account Tổ trưởng** → Nhận task → Phân task con cho thợ
5. **Switch sang account Thợ** → Upload ảnh báo cáo tiến độ 60% → Submit proof hoàn thành
6. **Switch về Tổ trưởng** → Duyệt proof → Xin gia hạn deadline
7. **Switch về Giám đốc** → Duyệt gia hạn → Xem dashboard cập nhật real-time
8. **Chat nhóm dự án** → Gửi tin nhắn + file bản vẽ cho cả team

---

## PART 2 — Full Product Roadmap (cover toàn bộ QUY_TRINH.txt)

---

### Phase 0 — Foundation (đã có, cần stabilize)
*Timeline: Done*

- [x] Authentication & RBAC
- [x] Company / Department / Role management
- [x] Project & Task management (hierarchical)
- [x] Task workflow + delay approval + proof upload
- [x] Dashboard KPI
- [x] Group Chat + WebSocket
- [x] Audit log

---

### Phase 1 — POC Completion
*Timeline: 2–3 tuần*

**Task Module:**
- [ ] Delay request & approval UI (P0)
- [ ] In-app notifications (P0)
- [ ] Subtask tree trong task detail (P0)
- [ ] Project-linked chat room (P0)
- [ ] Kanban board cho project (P1)
- [ ] Direct message UI (P1)
- [ ] Overdue highlight nâng cao (P1)
- [ ] Audit log UI trong task (P1)
- [ ] Gantt chart mini read-only (P2)
- [ ] Mobile UX task detail (P2)

---

### Phase 2 — Giai đoạn Sản Xuất Nhà Máy (QUY_TRINH II)
*Timeline: 4–6 tuần sau Phase 1*

**2A. Chấm Công (Attendance)**
- Model: `Attendance` (user_id, project_id, check_in_time, check_out_time, gps_lat, gps_lng, photo_url, note)
- API: `POST /attendance/checkin`, `POST /attendance/checkout`, `GET /attendance/report`
- Frontend: Màn hình mobile check-in/out với camera + GPS
- Dashboard: Bảng chấm công theo ngày/tuần/tháng, tổng giờ công mỗi người
- Geofence: Cảnh báo nếu check-in xa hơn X km so với địa điểm công trình

**2B. Kho & Vật Tư (Inventory)**
- Model: `Material` (tên, đơn vị, mã vật tư), `Warehouse`, `StockMovement` (nhập/xuất), `MaterialRequest` (phiếu yêu cầu)
- API: CRUD materials, `POST /materials/request`, `POST /warehouse/stock-in`, `POST /warehouse/stock-out`
- Frontend: Danh mục vật tư, tồn kho hiện tại, phiếu yêu cầu, lịch sử nhập xuất

**2C. Procurement / Nhà Cung Cấp**
- Model: `Supplier`, `PurchaseRequest`, `SupplierQuotation`, `PurchaseOrder`
- Workflow: Phiếu yêu cầu → Kỹ thuật duyệt → Vật tư tìm 3 nhà cung cấp → Giám đốc duyệt chọn → PO
- API: CRUD suppliers, quotation comparison API, PO generation
- Frontend: So sánh 3 báo giá, approval UI cho Giám đốc

**2D. Phân tích Năng Suất Tổ**
- Dashboard mới: Năng suất từng tổ (tổng task, % hoàn thành, tỷ lệ trễ, giờ công)
- So sánh kỳ này vs kỳ trước
- Export báo cáo PDF/Excel

---

### Phase 3 — Giai đoạn Báo Giá & Hợp Đồng (QUY_TRINH I)
*Timeline: 6–8 tuần sau Phase 2*

**3A. CRM / Khách Hàng**
- Model: `Customer` (tên công ty, địa chỉ, liên hệ, phân loại), `CustomerContact`
- API: CRUD customers, lịch sử dự án theo customer
- Frontend: Customer profile, lịch sử báo giá, tỷ lệ thắng/thua

**3B. Báo Giá (Quotation)**
- Model: `Quotation` (customer_id, project_name, status, ngày gửi, ngày phản hồi), `QuotationItem` (tên hạng mục, thông số kỹ thuật, số lượng, đơn vị, đơn giá vật tư, hệ số giá, thành tiền), `QuotationRevision`
- Workflow:
  1. Kinh doanh tạo yêu cầu → Kỹ thuật thiết kế
  2. Kỹ thuật tạo bảng chào giá khung (thông số + số lượng, chưa có giá)
  3. Vật tư điền đơn giá mua vào cho từng hạng mục
  4. Kinh doanh tính hệ số giá → ra bảng chào giá hoàn chỉnh
  5. Giám đốc duyệt → Gửi khách
  6. Theo dõi phản hồi → Cập nhật status (thắng/thua/điều chỉnh)
- API: CRUD quotations, `POST /quotations/{id}/submit`, `PATCH /quotations/{id}/status`, `GET /quotations/stats`
- Frontend: Form tạo báo giá có dạng bảng (spreadsheet-like), compare revisions, dashboard tỷ lệ thắng/thua

**3C. Hợp Đồng (Contract)**
- Model: `Contract` (linked to quotation + customer + project), `ContractPayment` (đợt thanh toán, số tiền, ngày dự kiến, trạng thái)
- Workflow: Tạo HĐ từ báo giá thắng → Gửi ký → Xác nhận tạm ứng đợt 1 → Theo dõi thanh toán
- API: CRUD contracts, payment schedule, `POST /contracts/{id}/confirm-payment`
- Frontend: Contract timeline, payment status tracker

---

### Phase 4 — Giai đoạn Lắp Đặt Công Trình Nâng Cao (QUY_TRINH III)
*Timeline: 4–5 tuần sau Phase 3*

**4A. Logistics / Vận Chuyển**
- Model: `DeliveryPlan` (từ kho → công trình, phương tiện, ngày, danh sách vật tư)
- Workflow: Cung ứng tổng hợp vật tư sẵn → Lên kế hoạch xe → Giám đốc duyệt → Vận chuyển
- Frontend: Lịch vận chuyển, danh sách hàng trên xe

**4B. Issue / Defect Tracking**
- Model: `Issue` (project_id, reporter_id, mô tả lỗi, severity, ảnh, trạng thái, nguyên nhân, cách xử lý)
- Trong task detail: nút "Báo cáo lỗi/sự cố"
- Dashboard lỗi: tần suất lỗi theo loại, theo tổ, cách khắc phục đã dùng
- Làm cơ sở cải tiến thiết kế sản phẩm

**4C. Field Inspection / Nghiệm Thu**
- Model: `Inspection` (project milestone, checklist items, inspector, kết quả, ảnh)
- Workflow: Hoàn thành lắp đặt → Tạo inspection checklist → Khách hàng ký nghiệm thu
- Lưu trữ hồ sơ nghiệm thu gắn với dự án

---

### Phase 5 — Analytics & Business Intelligence
*Timeline: 3–4 tuần sau Phase 4*

**5A. Báo Cáo Kinh Doanh**
- Tỷ lệ thắng/thua báo giá theo: khách hàng, loại thiết bị, thời gian, nhân viên
- Phân tích nguyên nhân thất bại: giá, thiết kế, tiếp thị
- Revenue pipeline từ báo giá → hợp đồng → thanh toán

**5B. Báo Cáo Sản Xuất**
- Năng suất mỗi tổ theo tháng/quý
- Tỷ lệ trễ hạn, nguyên nhân chậm tiến độ
- So sánh thực tế vs kế hoạch

**5C. Export & Integrations**
- Export PDF: báo giá, hợp đồng, báo cáo chấm công
- Export Excel: bảng vật tư, công nợ, tiến độ sản xuất
- Email notifications (task overdue, approval required)

---

### Tổng Quan Timeline

```
Hiện tại  ──── Phase 1 (POC) ──── Phase 2 ──── Phase 3 ──── Phase 4 ──── Phase 5
              2–3 tuần           +6 tuần      +8 tuần      +5 tuần      +4 tuần
              Task+Chat demo     Nhà máy      Báo giá      Công trình   Analytics
              → Demo khách       full ops     + Hợp đồng   nâng cao     + Reports
```

---

### Critical Files cần chỉnh sửa cho Phase 1 (POC)

**Backend (đã có sẵn, không cần thêm):**
- `/backend/app/api/routes/tasks.py` — delay approval endpoints
- `/backend/app/api/routes/chat.py` — create direct message room
- `/backend/app/api/routes/projects.py` — thêm `chat_room_id` field vào project

**Frontend (cần làm mới):**
- `/frontend/src/routes/_layout/tasks.$taskId.tsx` — thêm delay request UI, audit log tab, subtask section
- `/frontend/src/routes/_layout/projects.$projectId.tsx` — thêm kanban tab, overdue highlight, link to chat
- `/frontend/src/routes/_layout/chat.tsx` — thêm DM section
- `/frontend/src/components/notifications/` — tạo mới notification system
- `/frontend/src/routes/_layout/projects.$projectId.kanban.tsx` — tạo mới kanban view

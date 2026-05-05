# SRS - Saree ERP (Bản giới thiệu cho khách hàng)

## 1. Mục đích tài liệu

Tài liệu này mô tả phạm vi hệ thống Saree ERP, các chức năng nghiệp vụ chính, vai trò người dùng, và hướng dẫn sử dụng theo quy trình thực tế. Mục tiêu là giúp khách hàng:

- Hiểu hệ thống đang giải quyết bài toán gì.
- Nhận biết từng phân hệ và giá trị mang lại.
- Biết cách vận hành từ đầu đến cuối cho một đơn hàng/dự án.

## 2. Tổng quan hệ thống

Saree ERP là hệ thống quản trị vận hành cho doanh nghiệp sản xuất/thương mại, bao gồm các phân hệ:

- Quản trị tổ chức và phân quyền (RBAC).
- Quản lý dự án, công việc, tiến độ, bảng Gantt.
- Báo giá (Quotation) theo quy trình nhiều giai đoạn.
- Hợp đồng (Contract) từ báo giá đã chốt.
- Mua hàng (Procurement): yêu cầu mua, đơn mua, báo giá nhà cung cấp.
- Kho (Inventory): tồn kho, điều chỉnh, phiếu xuất.
- Nhà cung cấp (Supplier).
- Dashboard và báo cáo tổng hợp.
- Thông báo hệ thống theo sự kiện.

## 3. Vai trò người dùng

Hệ thống hỗ trợ bộ vai trò theo nghiệp vụ thực tế:

- `admin`: quản trị hệ thống tổng.
- `director`: phê duyệt cấp cao, xem toàn công ty.
- `department_head`: quản lý phòng ban.
- `sales`: xử lý báo giá, làm việc với khách hàng.
- `engineer`: khảo sát/kỹ thuật/thiết kế.
- `materials`: vật tư, giá thành, mua hàng, kho.
- `planner`, `workshop_lead`, `site_supply`, `installer`, `worker`: thực thi dự án và cập nhật tiến độ.

Mỗi vai trò được cấp quyền theo mã quyền (permission code) trên từng module, đảm bảo đúng người, đúng thao tác.

## 4. Phạm vi chức năng (Functional Scope)

### 4.1 Dashboard và Báo cáo

**Mục tiêu:** Cung cấp bức tranh tổng quan nhanh cho ban điều hành.

**Chức năng chính:**

- KPI tổng quan dự án, công việc, quá hạn.
- Workload theo nhân sự/phòng ban.
- Leaderboard hiệu suất.
- Lịch công việc (calendar heatmap).
- Báo cáo tổng hợp và báo cáo riêng cho báo giá.

**Cách sử dụng:**

1. Mở màn hình Dashboard.
2. Chọn bộ lọc (dự án, phòng ban, khoảng thời gian).
3. Xem KPI và danh sách cảnh báo.
4. Truy cập chi tiết từng mục để xử lý.

---

### 4.2 Quản trị tổ chức và phân quyền (Admin/RBAC)

**Mục tiêu:** Cấu hình cơ cấu công ty và quyền hạn truy cập.

**Chức năng chính:**

- Quản lý công ty, phòng ban.
- Quản lý vai trò và danh mục quyền.
- Gán vai trò cho người dùng theo công ty/phòng ban.
- Xem cây tổ chức (org tree).
- Quản lý user (thêm/sửa/xóa theo quyền).

**Cách sử dụng:**

1. Tạo cấu trúc công ty và phòng ban.
2. Cấu hình role và quyền cho role.
3. Gán user vào phòng ban và role phù hợp.
4. Kiểm tra quyền thao tác bằng tài khoản thử nghiệm.

---

### 4.3 Quản lý Dự án và Task

**Mục tiêu:** Kiểm soát tiến độ triển khai theo task/subtask.

**Chức năng chính:**

- Tạo/sửa/xóa dự án.
- Tạo task, subtask; phân cấp theo level.
- Gán assignee chính/phụ, observer.
- Đổi trạng thái task theo luồng xử lý.
- Thêm comment, báo cáo tiến độ, đính kèm proof.
- Quản lý dependency và hiển thị Gantt.
- Theo dõi audit log và cảnh báo trễ hạn.

**Cách sử dụng:**

1. Tạo dự án và cấu hình level task.
2. Lập danh sách task và subtask.
3. Gán nhân sự phụ trách và hạn hoàn thành.
4. Nhân sự cập nhật tiến độ/proof định kỳ.
5. Quản lý duyệt proof và xử lý task chậm.

---

### 4.4 Báo giá (Quotation)

**Mục tiêu:** Chuẩn hóa quy trình báo giá từ khảo sát đến chốt đơn.

**Chức năng chính:**

- Tạo báo giá và danh sách line item.
- Cập nhật cost/sale price theo hạng mục.
- Workflow stage theo các bước nghiệp vụ:
  - Submit/Approve survey.
  - Submit/Approve design.
  - Submit pricing, finalize.
  - Approve final, send to client.
  - Đóng báo giá (won/lost).
- Lưu lịch sử đàm phán (negotiation log).
- Quản lý tệp đính kèm.
- Báo cáo báo giá.

**Cách sử dụng:**

1. Sales tạo báo giá mới và nhập thông tin cơ bản.
2. Kỹ thuật cập nhật khảo sát/thiết kế.
3. Vật tư cập nhật giá, sales finalize.
4. Ban giám đốc phê duyệt cuối.
5. Gửi khách hàng và đóng trạng thái won/lost.

---

### 4.5 Hợp đồng (Contract)

**Mục tiêu:** Quản lý vòng đời hợp đồng sau khi báo giá thành công.

**Chức năng chính:**

- Tạo hợp đồng từ thông tin kinh doanh.
- Submit/approve/reject hợp đồng.
- Ký hợp đồng, xác nhận tạm ứng.
- Chuyển sang sản xuất, hoàn thành.
- Upload và quản lý file hợp đồng.

**Cách sử dụng:**

1. Tạo hợp đồng từ cơ hội đã chốt.
2. Đẩy quy trình duyệt nội bộ.
3. Ký kết và cập nhật các mốc thực hiện.
4. Theo dõi trạng thái đến khi complete.

---

### 4.6 Mua hàng (Procurement)

**Mục tiêu:** Kiểm soát mua sắm vật tư minh bạch và có phê duyệt.

**Chức năng chính:**

- Tạo Purchase Request (PR) và danh sách vật tư.
- Submit PR, tech review, director approve/reject.
- Tạo Purchase Order (PO) từ PR.
- Nhập báo giá nhà cung cấp cho từng item.
- Chọn nhà cung cấp trúng.
- Mark ordered, receive hàng.

**Cách sử dụng:**

1. Bộ phận vật tư tạo PR theo nhu cầu.
2. Kỹ thuật thẩm định kỹ thuật.
3. Ban giám đốc phê duyệt ngân sách.
4. Tạo PO, tổng hợp báo giá NCC.
5. Chọn NCC, đặt hàng và cập nhật nhận hàng.

---

### 4.7 Kho (Inventory)

**Mục tiêu:** Theo dõi tồn kho và cấp phát vật tư cho dự án.

**Chức năng chính:**

- Tạo và quản lý danh mục item kho.
- Điều chỉnh tồn kho (adjust) có lịch sử.
- Theo dõi stock movement (nhập/xuất/điều chỉnh).
- Cảnh báo thiếu vật tư.
- Tạo Material Issue (phiếu xuất) và item xuất.
- Duyệt/từ chối/thực thi phiếu xuất.

**Cách sử dụng:**

1. Khởi tạo danh mục item và tồn đầu.
2. Khi nhận hàng, cập nhật tồn kho.
3. Khi cấp vật tư cho dự án, tạo phiếu xuất.
4. Duyệt và execute phiếu xuất.
5. Theo dõi cảnh báo để đặt mua bổ sung.

---

### 4.8 Nhà cung cấp (Supplier)

**Mục tiêu:** Quản lý danh bạ NCC phục vụ mua hàng.

**Chức năng chính:**

- Tạo/sửa/xóa thông tin nhà cung cấp.
- Theo dõi thông tin liên hệ và ghi chú.
- Kết nối với quy trình PO/báo giá NCC.

**Cách sử dụng:**

1. Tạo hồ sơ NCC.
2. Cập nhật thông tin liên hệ khi có thay đổi.
3. Sử dụng NCC trong PO và so sánh báo giá.

---

### 4.9 Thông báo hệ thống

**Mục tiêu:** Nhắc việc và cảnh báo theo sự kiện.

**Chức năng chính:**

- Hiển thị thông báo mới/chưa đọc.
- Đánh dấu đã đọc từng thông báo.
- Đánh dấu đã đọc tất cả.

**Cách sử dụng:**

1. Nhấn icon thông báo trên giao diện.
2. Mở danh sách thông báo.
3. Xử lý tác vụ liên quan và mark read.

## 5. Luồng nghiệp vụ tổng thể (end-to-end)

1. **Báo giá:** Sales tạo Quotation -> các bộ phận điền dữ liệu -> BGD phê duyệt -> gửi khách.
2. **Ký kết:** Báo giá won -> tạo Contract -> duyệt/ký/tạm ứng.
3. **Mua vật tư:** Tạo PR -> thẩm định -> phê duyệt -> tạo PO -> chọn NCC -> nhận hàng.
4. **Vận hành kho:** Cập nhật tồn -> lập phiếu xuất cho dự án -> duyệt và cấp phát.
5. **Thực thi dự án:** Quản lý task, tiến độ, proof, cảnh báo trễ hạn trên Dashboard/Gantt.

## 6. Yêu cầu phi chức năng (Non-functional)

- **Bảo mật:** Đăng nhập JWT, phân quyền theo role và permission code.
- **Truy vết:** Có audit log trong quy trình task và các biến động quan trọng.
- **Toàn vẹn dữ liệu:** Ràng buộc theo workflow (state transition) ở module báo giá/hợp đồng/mua hàng.
- **Mở rộng:** Kiến trúc API tách module theo route/service/repository.
- **Khả dụng:** Giao diện web responsive, có thanh điều hướng mobile.

## 7. Hướng dẫn triển khai sử dụng cho khách hàng (gợi ý)

### Giai đoạn 1 - Khởi tạo hệ thống

- Tạo cấu trúc công ty, phòng ban, role.
- Khởi tạo danh sách user và gán quyền.
- Nạp danh mục NCC và vật tư cơ bản.

### Giai đoạn 2 - Vận hành thử nghiệm

- Chạy 1 case đầy đủ: Quotation -> Contract -> Procurement -> Inventory -> Task completion.
- Kiểm tra KPI trên Dashboard và báo cáo.
- Chỉnh role/quyền nếu cần.

### Giai đoạn 3 - Vận hành chính thức

- Chuẩn hóa quy trình theo vai trò.
- Định kỳ kiểm tra cảnh báo quá hạn và tồn kho thiếu.
- Theo dõi hiệu suất bộ phận qua báo cáo.

## 8. Giới hạn và ghi chú hiện trạng

- Một số màn hình mang tính dashboard/nội bộ có thể tối ưu thêm quy trình quyền khi mở rộng.
- Các route báo cáo đã có ở mục tổng hợp; nếu khách hàng cần dashboard BI sau, có thể bổ sung dashboard chuyên sâu theo KPI riêng.
- Các phân hệ cốt lõi (Task, Quotation, Contract, Procurement, Inventory, Supplier, RBAC) đã có đủ endpoint và giao diện để vận hành quy trình chính.

## 9. Tiêu chí nghiệm thu đề xuất

- User theo từng vai trò đăng nhập và chỉ thấy thao tác đúng quyền.
- Hoàn tất được luồng nghiệp vụ từ Báo giá đến cấp phát vật tư.
- Có lịch sử và trạng thái rõ ràng tại mỗi bước duyệt.
- Dashboard phản ánh đúng dữ liệu nghiệp vụ đã phát sinh.

---

Tài liệu này được tổng hợp trực tiếp từ source code hiện tại của hệ thống Saree ERP (backend API + frontend routes/components/modules), phù hợp cho mục đích giới thiệu và demo nghiệp vụ với khách hàng.

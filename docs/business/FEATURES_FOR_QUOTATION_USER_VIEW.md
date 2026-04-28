# Bảng Module & Features (User-facing) — Saree ERP

Mục tiêu tài liệu: dùng để **báo giá cho khách hàng**, mô tả rõ hệ thống đang có những gì theo góc nhìn người dùng.

## Phạm vi

- Chỉ liệt kê tính năng người dùng nhìn thấy/được thao tác trên UI.
- Format cố định 2 cột: **Module** và **Features trong module**.
- Dùng ngôn ngữ nghiệp vụ, dễ đọc với khách hàng không kỹ thuật.

---

## Danh mục module và features

| Module | Features trong module |
|---|---|
| **Xác thực & Tài khoản** | - Đăng nhập hệ thống.<br>- Đăng ký tài khoản.<br>- Quên mật khẩu.<br>- Đặt lại mật khẩu qua link/token.<br>- Quản lý phiên đăng nhập (hết hạn thì yêu cầu đăng nhập lại). |
| **Phân quyền (RBAC)** | - Điều hướng menu theo quyền từng người dùng.<br>- Ẩn/hiện màn hình theo vai trò (staff, manager, BGĐ, admin).<br>- Hạn chế thao tác theo quyền (xem/tạo/duyệt/chỉnh sửa).<br>- Các workflow chỉ hiển thị action phù hợp quyền hiện tại. |
| **Tổng quan quản lý (Dashboard)** | - KPI tổng quan: số dự án, số task hoàn thành, tỷ lệ hoàn thành, cảnh báo dự án.<br>- Lọc dashboard theo dự án và phòng ban.<br>- Widget “Báo giá chờ xử lý”.<br>- Widget “Mua hàng cần xử lý”.<br>- Danh sách cảnh báo dự án theo mức độ (critical/warning/watch).<br>- Bảng danh sách dự án với tiến độ, số task, số task trễ hạn.<br>- Tabs phân loại dự án: tất cả/đang làm/chưa bắt đầu/hoàn thành.<br>- Khối phân bổ nguồn lực theo nhân sự (workload).<br>- Leaderboard hiệu suất nhân sự.<br>- Tạo dự án nhanh ngay từ dashboard. |
| **Task Management (Công việc)** | - Màn hình “Công việc của tôi” chia theo mức ưu tiên: quá hạn nghiêm trọng, quá hạn, sắp đến hạn, hôm nay, đang thực hiện.<br>- Card công việc có tiến độ, deadline, người phối hợp, người giao việc.<br>- Chi tiết task với trạng thái workflow: chờ làm/đang làm/hoàn thành.<br>- Cập nhật tiến độ theo phần trăm + ghi chú.<br>- Upload ảnh hiện trường khi báo cáo tiến độ.<br>- Quản lý bằng chứng hoàn thành và duyệt/từ chối bằng chứng.<br>- Luồng xin gia hạn deadline và phê duyệt gia hạn.<br>- Gán người thực hiện, thêm người phối hợp, thêm observer, đổi người phụ trách chính.<br>- Quản lý task phụ thuộc (dependency) và task bị chặn (blocked by).<br>- Quản lý công việc con (subtasks), bao gồm trọng số đóng góp tiến độ.<br>- Thảo luận nội bộ trong task (comment thread).<br>- Lịch sử thao tác/audit log theo thời gian.<br>- Cập nhật realtime qua websocket. |
| **Quản lý Báo giá (Quotation)** | - Danh sách hồ sơ báo giá với tìm kiếm và bộ lọc đa tiêu chí.<br>- Bộ lọc theo: công ty khách hàng, hạng mục thiết bị, trạng thái, giai đoạn.<br>- Xem badge “Việc của tôi” để biết hồ sơ cần xử lý theo vai trò hiện tại.<br>- Tạo hồ sơ báo giá theo wizard 2 bước (thông tin công ty + thông tin dự án/khảo sát).<br>- Chọn công ty cũ để auto-fill thông tin liên hệ, địa chỉ, ghi chú.<br>- Quản lý toàn bộ vòng đời báo giá theo stage workflow.<br>- Action panel thao tác theo giai đoạn: nộp duyệt, duyệt/từ chối, gửi khách, thương lượng, chốt kết quả.<br>- Tab Tổng quan: thông tin khách hàng, phụ trách, tài chính, timeline mốc quan trọng.<br>- Bật/tắt hiển thị giá trị tài chính trên màn hình chi tiết.<br>- Tab Trao đổi với khách: lưu nhật ký thương lượng (ngày, hình thức, nội dung, phản hồi, follow-up).<br>- Tab Tài liệu: upload nhiều file, nhóm tài liệu theo nghiệp vụ, quản lý version và file đã duyệt.<br>- Tab Lịch sử: timeline chuyển bước + đính kèm theo từng bước.<br>- Đánh dấu outcome báo giá: thắng/thua + lý do thua chi tiết.<br>- Điều hướng nhanh sang dự án liên kết khi hồ sơ thắng. |
| **Báo cáo Báo giá** | - Dashboard phân tích báo giá theo thời gian và bộ lọc.<br>- Summary cards: tổng hồ sơ, đang xử lý, đã gửi, thương lượng, thắng, thua, tỷ lệ thắng.<br>- Highlight tổng giá trị hợp đồng thắng.<br>- Biểu đồ theo hạng mục thiết bị (win/loss/in-progress).<br>- Biểu đồ nguyên nhân thua (pie chart).<br>- Bảng thống kê theo khách hàng (tổng, thắng, thua, tỷ lệ, giá trị).<br>- Bảng thống kê theo hạng mục (tổng, thắng, thua, tỷ lệ). |
| **Quản lý Hợp đồng (Contract)** | - Danh sách hợp đồng với lọc theo trạng thái.<br>- Tạo hợp đồng mới từ báo giá thắng.<br>- Chỉ cho chọn báo giá thắng chưa phát sinh hợp đồng (chống trùng).<br>- Theo dõi vòng đời hợp đồng bằng stepper trạng thái.<br>- Hướng dẫn bước tiếp theo theo trạng thái thực tế (next-steps guide).<br>- Workflow action theo vai trò: nộp BGĐ duyệt, BGĐ duyệt/từ chối, xác nhận khách ký, xác nhận tạm ứng, chuyển sản xuất, hoàn thành.<br>- Ghi chú nghiệp vụ dạng rich text theo từng lần chuyển bước.<br>- Đính kèm chứng từ theo phase (hợp đồng PDF, bản vẽ, tài liệu khác).<br>- Quản lý tài liệu hợp đồng: upload/xem/xóa/download.<br>- Lịch sử thay đổi hợp đồng dưới dạng timeline.<br>- Lọc lịch sử theo từng trạng thái trong quy trình.<br>- Điều hướng sang dự án liên kết trong giai đoạn sản xuất. |
| **Dự án (Projects)** | - Danh sách dự án.<br>- Chi tiết dự án theo tiến độ thực tế.<br>- Theo dõi tiến độ tổng hợp từ task và công việc con.<br>- Liên kết dự án với luồng báo giá/hợp đồng khi chốt thắng.<br>- Điều phối và giám sát thực thi theo timeline. |
| **Gantt / Tiến độ kế hoạch** | - Biểu đồ Gantt theo dự án để trực quan hóa kế hoạch.<br>- Hiển thị mốc thời gian task và phụ thuộc giữa các task.<br>- Theo dõi khả năng chậm tiến độ theo timeline.<br>- Hỗ trợ điều phối theo trình tự công việc. |
| **Mua hàng (Procurement)** | - Quản lý yêu cầu mua hàng (PR).<br>- Luồng duyệt nhiều cấp: kỹ thuật/BGĐ theo quyền.<br>- Quản lý đơn đặt hàng (PO) theo trạng thái thực tế.<br>- Theo dõi các action cần làm: chọn NCC, thêm báo giá, xác nhận đặt hàng, nhận hàng.<br>- Điều hướng từ task sang PR/PO liên quan để vận hành theo quy trình. |
| **Kho hàng (Inventory)** | - Quản lý danh mục vật tư/hàng hóa.<br>- Quản lý phiếu xuất kho/issue.<br>- Liên kết xuất kho với công việc thực thi ngoài hiện trường.<br>- Theo dõi trạng thái vật tư phục vụ sản xuất/lắp đặt. |
| **Nhà cung cấp (Suppliers)** | - Danh sách nhà cung cấp.<br>- Xem chi tiết hồ sơ nhà cung cấp.<br>- Dùng trong quy trình chọn NCC khi mua hàng. |
| **Hợp đồng - Báo giá - Task liên kết chuỗi** | - Từ báo giá thắng tạo hợp đồng.<br>- Từ hợp đồng điều hướng sang dự án và task triển khai.<br>- Từ task tạo yêu cầu mua hàng hoặc phiếu xuất kho.<br>- Tạo chuỗi vận hành end-to-end từ bán hàng đến triển khai. |
| **Chat nội bộ** | - Màn hình chat nội bộ theo thời gian thực.<br>- Nhắn tin phục vụ phối hợp vận hành trong hệ thống.<br>- Hỗ trợ giao tiếp nhanh giữa các bộ phận. |
| **Thông báo (Notifications)** | - Cập nhật sự kiện nghiệp vụ tới người dùng liên quan.<br>- Hỗ trợ người dùng nhận biết việc cần xử lý sớm. |
| **Quản lý công ty (Company)** | - Màn hình quản lý thông tin nội bộ cấp công ty.<br>- Tập trung các cấu hình/tổ chức liên quan vận hành doanh nghiệp. |
| **Admin hệ thống** | - Màn hình quản trị cho tài khoản superuser.<br>- Quản lý nghiệp vụ mức hệ thống theo quyền admin.<br>- Phục vụ cấu hình và vận hành toàn cục. |
| **Settings (Cài đặt)** | - Màn hình cấu hình cá nhân/hệ thống ở mức UI.<br>- Truy cập nhanh từ điều hướng chính/mobile bottom nav. |
| **Reports (Tổng hợp báo cáo)** | - Màn hình báo cáo tổng hợp ngoài báo giá.<br>- Cung cấp góc nhìn quản trị đa nghiệp vụ. |
| **Dashboard nhân sự** | - Trang chi tiết hiệu suất từng nhân sự.<br>- Truy cập từ leaderboard dashboard. |
| **Items** | - Màn hình nghiệp vụ `items` trong layout hiện tại.<br>- Dùng cho quản lý dữ liệu danh mục liên quan. |

---

## Ghi chú khi dùng tài liệu này để báo giá

- Nếu cần báo giá theo cấp độ, có thể tách mỗi module thành:
  - **Core features** (bắt buộc)
  - **Advanced features** (nâng cao)
  - **Integration features** (liên thông module)
- Có thể bổ sung thêm 2 cột phụ ở file khác:
  - **Mức độ phức tạp** (Low/Medium/High)
  - **Ước lượng effort** (MM hoặc tuần)


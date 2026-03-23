
BIÊN BẢN HỌP YÊU CẦU TÍNH NĂNG HỆ THỐNG QUẢN LÝ
Nhân sự nổi bật được nhắc đến: Anh Vũ (Định hướng: Tập trung tối ưu hóa trải nghiệm trên ứng dụng điện thoại - Mobile App).
1. Quản lý Tổ chức & Phân quyền (Organization & Roles)
Cơ cấu tổ chức: Phân chia rõ ràng giữa Khối Dự án và Khối Office. Hỗ trợ tạo các phòng ban (Kỹ thuật lắp đặt, Kế toán...).
Phân quyền (Roles): Có phân cấp Role (Cấp 1, 2, 3).
Quản lý nguồn lực:
Có sơ đồ/biểu đồ hiển thị trạng thái nhân sự (xanh, đỏ, vàng) để biết ai đang rảnh/bận.
Phân nhóm thợ (VD: Thợ điện). Có thể lọc nhân sự theo vị trí và trạng thái rảnh việc để giao task.
2. Module Quản lý Dự án & Công việc (Project & Task Management)
Cấu trúc dự án: Quản lý số lượng thành viên, tên dự án, phòng ban trực thuộc, người quản lý dự án. Phân rã công việc theo dạng cây (Công trình -> Hạng mục lớn -> Công việc con/nhỏ dần).
Màn hình Giao/Nhận việc:
Thông tin chi tiết: Tên công việc, người giao, người nhận, người theo dõi (chỉ xem, không sửa), phòng ban, role, thời gian Bắt đầu/Kết thúc.
Thành phần bổ trợ: Checklist, đính kèm tài liệu, gắn link, bình luận, báo cáo kết quả (có đính kèm bằng chứng để tránh cập nhật sai).
Dashboard Nhận việc: Hiển thị công việc quan trọng, công việc hôm nay, công việc muộn.
Tính năng nâng cao:
Nhân bản (Clone): Cho phép nhân bản công việc, phòng ban, hoặc toàn bộ quy trình dự án (giữ lại các bước, chỉ thay đổi người thực hiện).
Công việc lặp lại: Thiết lập chu kỳ tự động giao việc.
Quản lý rủi ro & Trễ hạn: Cảnh báo khi sắp tới deadline. Nếu trễ hạn, yêu cầu giải trình lý do trong phần bình luận (gửi request xin phép sếp). Xử lý logic tiến độ dây chuyền (một công việc trễ sẽ đẩy lùi tiến độ các công việc sau). Báo cáo những việc trễ hạn nhưng không ảnh hưởng tổng tiến độ (màu đỏ).
Audit Trail: Lưu trữ lịch sử hoạt động (ai sửa gì, lúc nào) để truy vết trách nhiệm.
3. Module Chấm công & Tiền lương (Timekeeping & Payroll)
Chấm công đa hình thức: Tích hợp máy vân tay, nhận diện khuôn mặt, và định vị GPS.
Quản lý địa điểm: Chấm công theo vị trí linh hoạt (VD: Định vị trí của 3 máy lạnh ở 3 nơi khác nhau) hoặc chấm công không ràng buộc vị trí tùy đối tượng.
Lương & Phụ cấp: Tích hợp dữ liệu chấm công để tính lương, công tác phí và phụ cấp.
4. Module Quản lý Quy trình & Đề xuất (Workflow & Approvals)
Quy trình sản xuất (Agile): * Các bước: Nhận đơn -> Phân phối kiểm tra -> Kế hoạch sản xuất -> Sản xuất -> QA/QC.
Cho phép liên kết quy trình với công việc cụ thể. Phân định rõ Người quản trị giai đoạn và Người thực thi. Cho phép tùy chỉnh quyền hạn trong từng giai đoạn.
Đề xuất nội bộ (E-Office): * Hỗ trợ tạo phiếu đề xuất (VD: Phiếu mua hàng).
Quy trình duyệt nhiều cấp (mỗi mức chi phí/loại phiếu có người duyệt khác nhau).
Hỗ trợ chữ ký điện tử.
5. Nhắn tin & Giao tiếp Nội bộ (Internal Communication)
Không gian Chat: Hệ thống chat nhóm tương tự Zalo, tích hợp thẳng vào hệ thống.
Chat theo Dự án: Tự động tạo/link group chat ứng với từng dự án (VD: Nhóm dự án 7 người có group thảo luận chung).
Lưu trữ & Bảo mật: Dữ liệu chat, file đính kèm được lưu trữ vĩnh viễn trên hệ thống. Tránh tình trạng mất dữ liệu khi nhân sự nghỉ việc.
6. Module Báo cáo & Thống kê (Reports & Dashboards)
Báo cáo Công việc: Tổng số công việc, tổng số hoàn thành/nhân viên, tỉ lệ hoàn thành theo ngày/tháng.
Bảng xếp hạng (Leaderboard): Nhân viên xuất sắc (tỉ lệ hoàn thành cao nhất), làm việc nhiều nhất, làm muộn nhiều nhất, người tạo/giao việc nhiều nhất.
Báo cáo Hệ thống: Báo cáo tỉ lệ/mức độ sử dụng các module của phần mềm theo thời gian (User Activity).

Các role default, các role tương lai người dùng dự add vào => cần có logic để phân quyền đúng. Tập trung kỹ vào phân quyền và liên kết các object


#Nội dung chính
TỔNG QUAN HỆ THỐNG QUẢN TRỊ DOANH NGHIỆP HỢP NHẤT (ERP-LIGHT)
1. Mục tiêu cốt lõi
Hệ thống được xây dựng nhằm chuyển đổi số toàn diện hoạt động vận hành của doanh nghiệp, tập trung vào hai khối đặc thù: Khối Dự án (Hiện trường/Công trình) và Khối Văn phòng. Trọng tâm của hệ thống là tối ưu hóa trải nghiệm trên Mobile App để phục vụ đội ngũ kỹ thuật/thợ tại hiện trường, đồng thời đảm bảo tính kiểm soát chặt chẽ cho cấp quản lý thông qua dữ liệu thời gian thực.

2. Triết lý vận hành: "Gắn kết & Minh bạch"
Hệ thống không chỉ là công cụ quản lý việc làm mà là một hệ sinh thái dữ liệu liên kết:

Liên kết Nhân sự - Công việc: Biết chính xác ai đang rảnh để giao việc dựa trên trạng thái (Xanh/Đỏ/Vàng).

Liên kết Quy trình - Giao tiếp: Chat không chỉ là tán gẫu mà là một phần của hồ sơ dự án, dữ liệu được lưu trữ vĩnh viễn để phục vụ truy xuất và hậu kiểm (Audit Trail).

Liên kết Hiệu suất - Đãi ngộ: Dữ liệu từ chấm công GPS/Khuôn mặt và kết quả hoàn thành công việc là cơ sở trực tiếp để tính lương và bảng xếp hạng (Leaderboard).

3. Cấu trúc Phân quyền & Đối tượng (Core Logic)
Đây là "xương sống" của hệ thống mà bạn đặc biệt lưu tâm. Logic phân quyền được thiết kế theo mô hình RBAC (Role-Based Access Control) mở rộng:

Cấu trúc cây (Hierarchy): Phân cấp từ Công ty -> Phòng ban -> Dự án -> Hạng mục -> Công việc con.

Phân quyền đa tầng (Multi-level Roles): Không chỉ dừng lại ở Role mặc định, hệ thống cho phép định nghĩa các Role tương lai với quyền hạn tùy chỉnh (Xem/Sửa/Duyệt) cho từng giai đoạn của quy trình sản xuất.

Tính kế thừa: Các thuộc tính về quyền có thể được nhân bản (Clone) khi tạo dự án mới, giúp tiết kiệm thời gian thiết lập nhưng vẫn đảm bảo tính chính xác của luồng phê duyệt.

4. Các điểm nhấn công nghệ & Tiện ích
Quản trị rủi ro chủ động: Hệ thống tự động tính toán tác động dây chuyền (Critical Path). Nếu một mắt xích trễ, toàn bộ tiến độ phía sau sẽ được cảnh báo và yêu cầu giải trình số hóa.

Số hóa quy trình phê duyệt (E-Office): Loại bỏ giấy tờ thông qua chữ ký điện tử và luồng duyệt đa cấp theo giá trị chi phí.

Tối ưu di động (Mobile First): Mọi thao tác từ chấm công GPS tại 3 điểm máy lạnh khác nhau đến báo cáo kết quả bằng hình ảnh đều được thực hiện mượt mà trên điện thoại.

5. Giá trị mang lại cho quản lý
Cung cấp một "Bàn cờ nhân sự" tổng thể:

Nhìn thấy điểm nóng (nơi trễ hạn).

Nhìn thấy nhân sự tinh tú (thông qua Leaderboard).

Nhìn thấy mức độ "sống" của hệ thống (User Activity) để điều chỉnh quy trình kịp thời.

Logic Phân quyền & Liên kết Object (Phân tích thêm cho yêu cầu của bạn)
Để giải quyết bài toán "Role default và Role tương lai", hệ thống cần một Matrix Permission (Ma trận quyền hạn):

Object (Đối tượng): Dự án, Task, Tài liệu, Đề xuất, Chat.

Action (Hành động): Create, Read, Update, Delete, Approve, Follow.

Scope (Phạm vi): Cá nhân, Phòng ban, Toàn khối, Toàn công ty.

Ví dụ: Một "Thợ điện" (Role Cấp 3) có quyền Update kết quả vào Task được giao, nhưng chỉ có quyền Read trong Group Chat của dự án đó. Khi bạn thêm một Role mới như "Tổ trưởng kỹ thuật", bạn chỉ cần gán quyền Approve cho các Task thuộc cấp độ "Công việc con" mà không cần sửa code hệ thống.

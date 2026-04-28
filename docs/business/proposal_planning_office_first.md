# ĐỀ XUẤT TRIỂN KHAI - ƯU TIÊN KHỐI VĂN PHÒNG

## 1) Mục tiêu và chiến lược triển khai

### Mục tiêu
- Demo sớm cho khối văn phòng để chốt quy trình nội bộ và lấy phản hồi từ bộ phận Kinh doanh, Kỹ thuật, Vật tư, Ban giám đốc.
- Ưu tiên các luồng tạo giá trị doanh thu và vận hành: Báo giá -> Hợp đồng -> Vật tư.
- Tích hợp thông báo Zalo để nhắc việc phê duyệt và cập nhật trạng thái theo sự kiện.

### Chiến lược
- Triển khai theo thứ tự module phụ thuộc nghiệp vụ: `Báo giá + Hợp đồng + Vật tư (Mua hàng + Kho) + Thông báo Zalo`.
- Mỗi module phát triển trong 3 tuần, sau đó 2 tuần củng cố (hardening)/sửa lỗi để người dùng kiểm thử an toàn.
- Giai đoạn tiếp theo mới mở rộng sang module Task chi tiết cho công nhân khối ngoài.

---

## 2) Cơ sở nghiệp vụ đã khảo sát và đối chiếu

Đề xuất này được lập dựa trên:
- Quy trình trong `Document/Quy_trinh.txt`:
  - Giai đoạn I: Nhận yêu cầu báo giá, luân chuyển Kinh doanh -> Kỹ thuật -> Vật tư -> Kinh doanh -> Ban giám đốc -> Khách hàng.
  - Giai đoạn II: Sau khi chốt, vào Hợp đồng, tạm ứng, triển khai vật tư và sản xuất.
  - Giai đoạn III: Triển khai ngoài công trường và quản trị tiến độ công nhân.
- Phạm vi hệ thống hiện tại trong `Document/SRS_Saree_ERP_Khach_hang.md`:
  - Đã có module Báo giá, Hợp đồng, Mua hàng, Kho, Task và Notification nội bộ.

---

## 3) Kế hoạch timeline tổng thể đề xuất

### Phase A - Ưu tiên demo khối văn phòng (8 tuần, mục tiêu test nội bộ)

#### Tổng quan
- Thời gian: `8 tuần (~2 tháng)`.
- Cấu trúc:
  - `Tuần 1-6`: Xây dựng 3 module nghiệp vụ văn phòng (3 tuần/module theo đề xuất).
  - `Tuần 7-8`: Tổng hợp hardening, fix bug, UAT, chốt quy trình.

#### A1. Module Báo giá + Hợp đồng (Tuần 1-3)
- Lý do gom chung:
  - Luồng nghiệp vụ liên tục từ báo giá sang hợp đồng.
  - Nhóm người dùng chính: Kinh doanh + Giám đốc + Kỹ thuật + Vật tư.
- Phạm vi chính:
  - Quy trình báo giá nhiều giai đoạn, dòng sản phẩm, phê duyệt, thương lượng, đóng trạng thái thắng/thua.
  - Tạo Hợp đồng từ báo giá đã thắng, quản lý trạng thái, tệp đính kèm, mốc tạm ứng.
  - Luật chuyển tiếp nghiệp vụ:
    - Chỉ cho phép tạo Hợp đồng từ báo giá đã `won`.
    - Hợp đồng sau trạng thái `advance_received` sẽ kích hoạt thông báo cho các bộ phận liên quan.
- Đầu ra:
  - Chạy trọn vẹn quy trình văn phòng: Tạo báo giá -> duyệt -> gửi khách -> thắng -> tạo hợp đồng -> xác nhận tạm ứng.

#### A2. Module Vật tư (Mua hàng + Kho) (Tuần 4-6)
- Phạm vi chính:
  - Mua hàng:
    - Yêu cầu mua hàng -> duyệt kỹ thuật -> duyệt giám đốc -> tạo Đơn mua hàng (PO) -> so sánh NCC -> đặt hàng -> nhận hàng.
  - Kho:
    - Quản lý tồn kho, luân chuyển kho, cảnh báo tồn thấp, cấp phát vật tư.
  - Kết nối Mua hàng - Kho:
    - Nhận hàng cập nhật kho tự động.
    - Xuất kho theo yêu cầu cấp phát, có quy trình duyệt/thực hiện.
- Đầu ra:
  - Luồng liên kết tiếp theo của hợp đồng sau tạm ứng cho khối vật tư.
  - Có báo cáo tồn kho, lịch sử nhập xuất, và cảnh báo thiếu vật tư.

#### A3. Thông báo Zalo (xuyên suốt, chốt trong tuần 6)
- Phạm vi chính:
  - Gửi thông báo theo sự kiện quan trọng:
    - Báo giá đến lượt phê duyệt.
    - Hợp đồng chuyển trạng thái (gửi/ký/nhận tạm ứng/bắt đầu sản xuất).
    - PR/PO cần duyệt, đã duyệt, đã nhận hàng.
    - Cảnh báo tồn kho thấp.
  - Gắn người nhận theo quyền/phân vai.
  - Có dự phòng (fallback) trong hệ thống nếu Zalo lỗi.
- Đầu ra:
  - Người dùng văn phòng nhận được cảnh báo Zalo kịp thời, giảm bỏ sót nhiệm vụ.

#### A4. Hardening và UAT (Tuần 7-8)
- Mục tiêu:
  - Tổng hợp fix bug sau khi user test 3 module.
  - Ổn định phân quyền, di trú dữ liệu, thống nhất báo cáo.
- Hoạt động:
  - Kiểm thử hồi quy toàn bộ các luồng end-to-end.
  - Chuẩn hóa thông điệp lỗi và trải nghiệm chuyển giai đoạn UX.
  - Checklist UAT theo vai trò (Kinh doanh/Kỹ thuật/Vật tư/Giám đốc/Admin).
- Đầu ra:
  - Bản build sẵn sàng test chính thức cho khối văn phòng.

---

### Phase B - Task chi tiết cho công nhân khối ngoài (6 tuần)

#### Tổng quan
- Thời gian: `6 tuần`
  - `4 tuần`: Xây dựng module Task chi tiết công trình.
  - `2 tuần`: Fix bug + vận hành thử.

#### B1. Xây dựng module Task ngoài công trường (Tuần 9-12)
- Phạm vi chính:
  - Lập kế hoạch Task, theo dõi nhóm thợ theo các công đoạn ngoài công trường.
  - Cập nhật tiến độ hằng ngày, minh chứng hình ảnh, checklist nghiệp vụ.
  - Sinh yêu cầu delay, phê duyệt gia hạn, nhật ký vấn đề/sự cố.
  - Chat theo dự án/đội thi công, thông báo trực tiếp đến quản lý.
  - Báo cáo hiệu suất cá nhân/tổ đội theo ngày, tuần.
- Lưu ý so với hiện trạng:
  - Cây Task hiện tại 2 cấp (`Task -> Subtask`), chưa có task con nhiều cấp.
  - Tính toán tiến độ theo trọng số vẫn giữ nguyên logic hiện tại.

#### B2. Hardening module field (Tuần 13-14)
- Mục tiêu:
  - Ổn định trải nghiệm người dùng ngoài công trường (kết nối yếu, cần cập nhật liên tục).
  - Chuẩn hóa dashboard đánh giá tiến độ, trễ hạn, hiệu suất nhân sự.
- Đầu ra:
  - Đã có thể cho người dùng khối ngoài sử dụng thực tế.

---

### Phase C - Bổ sung mở rộng (tùy chọn)

#### C1. Nâng cấp Mobile
- Ước tính: `1 tuần / 1 tính năng`.
- Danh sách ưu tiên đề xuất:
  - Check-in/check-out nhanh.
  - Tải lên ảnh tiến độ từ camera.
  - Soạn nháp offline rồi đồng bộ lại.
  - Nút thao tác nhanh trên mobile cho chuyển trạng thái Task.

#### C2. Tự động gửi email
- Ước tính: `1 tuần`
- Phạm vi:
  - Gửi email tự động theo các mốc duyệt quan trọng (báo giá/hợp đồng/mua hàng).
  - Mẫu email theo dạng vai trò & sự kiện.
  - Lưu lịch sử gửi và retry khi gửi thất bại.

---

## 4) Mốc và tiêu chí nghiệm thu

#### Milestone 1 - Kết thúc tuần 3
- Demo được luồng Báo giá + Hợp đồng hoàn chỉnh cho khối văn phòng.

#### Milestone 2 - Kết thúc tuần 6
- Demo hoàn thiện luồng Vật tư (PR -> PO -> Nhận hàng -> Cập nhật kho) + thông báo Zalo.

#### Milestone 3 - Kết thúc tuần 8
- Hoàn thiện bugfix khối văn phòng, bắt đầu test người dùng diện rộng.

#### Milestone 4 - Kết thúc tuần 14
- Module Task dành cho công nhân khối ngoài ổn định, sẵn sàng triển khai thật.

---

## 5) Rủi ro và giải pháp

### Rủi ro 1 - Trượt phạm vi do yêu cầu phát sinh của user
- Giải pháp:
  - Chốt phạm vi việc theo từng mốc milestone.
  - Các mục phát sinh đưa vào backlog chuyển sang sprint sau.

### Rủi ro 2 - Tích hợp Zalo trễ do phụ thuộc API/duyệt ứng dụng
- Giải pháp:
  - Làm adapter trung gian + backup thông báo nội bộ hệ thống.
  - Ưu tiên sự kiện trọng yếu trước, các event mở rộng phát triển sau.

### Rủi ro 3 - Khoảng cách dữ liệu/phân quyền giữa module cũ/mới
- Giải pháp:
  - Kiểm thử ma trận theo vai trò.
  - UAT theo luồng end-to-end, không kiểm thử rời rạc từng màn hình.

---

## 6) Kế hoạch vận hành đề xuất

- Tuần 0 (khởi động):
  - Chốt owner theo từng module.
  - Chốt danh sách user UAT của khối văn phòng.
  - Khóa bộ KPI đánh giá demo.
- Mỗi cuối tuần:
  - Demo increment cho toàn bộ team.
  - Chốt checklist hoàn thành và bug list.
- Kết thúc mỗi phase:
  - Đóng băng bản release candidate.
  - UAT 3-5 ngày trước khi chuyển sang phase tiếp theo.

---

## 7) Kết luận

Kế hoạch này đáp ứng tiêu chí:
- Ưu tiên khối văn phòng demo trước với các module chính: `Báo giá + Hợp đồng + Vật tư + Thông báo Zalo`.
- Tổng thời gian khối office: `8 tuần (2 tháng)`.
- Tiếp theo là module task chi tiết cho công nhân: `4 tuần build + 2 tuần fix`.
- Mở rộng linh hoạt: Mobile từng tính năng (`1 tuần/tính năng`) hoặc tự động email (`1 tuần`).

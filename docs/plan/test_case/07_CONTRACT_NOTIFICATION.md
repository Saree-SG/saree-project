# TC-07: Hợp đồng & Thông báo

## PHẦN A: Hợp đồng (Contract)

### Điều kiện tiên quyết
- Báo giá ở S9_CONTRACT
- Tài khoản: sales@test.com, pm@test.com, admin@test.com

---

### TC-07-01: Tạo hợp đồng từ báo giá S9

**Steps:**
1. POST `/api/v1/contracts/` với:
   ```json
   {
     "quotation_id": "...",
     "value": 500000000,
     "signed_date": "2026-06-01",
     "start_date": "2026-06-10",
     "end_date": "2026-09-10",
     "description": "Hợp đồng lắp đặt hệ thống điện lạnh VP ABC"
   }
   ```

**Expected:**
- HTTP 201
- Dự án được tạo liên kết với hợp đồng

---

### TC-07-02: Không tạo hợp đồng từ báo giá chưa đạt S9

**Steps:**
1. Báo giá ở S7, tạo hợp đồng

**Expected:**
- HTTP 422 — "Báo giá chưa đạt giai đoạn hợp đồng"

---

### TC-07-03: Xem danh sách hợp đồng

**Steps:**
1. GET `/api/v1/contracts/`

**Expected:**
- Trả về danh sách hợp đồng của user (hoặc tất cả nếu có quyền)

---

### TC-07-04: Cập nhật hợp đồng

**Steps:**
1. PATCH `/api/v1/contracts/{id}` với `value = 550000000`

**Expected:**
- `value` cập nhật đúng

---

### TC-07-05: Theo dõi tiến độ thanh toán

**Steps:**
1. POST `/api/v1/contracts/{id}/payments` với:
   ```json
   { "amount": 100000000, "payment_date": "2026-07-01", "note": "Đợt 1" }
   ```
2. GET contract — xem `paid_amount`

**Expected:**
- `paid_amount` cập nhật đúng

---

### TC-07-06: Tổng thanh toán không vượt giá trị hợp đồng

**Steps:**
1. Thanh toán nhiều đợt vượt `value`

**Expected:**
- HTTP 422 hoặc cảnh báo

---

---

## PHẦN B: Thông báo (Notification)

### TC-07-07: Thông báo khi báo giá chuyển giai đoạn

**Steps:**
1. Báo giá chuyển từ S1 → S2
2. GET `/api/v1/notifications/` với token director@test.com

**Expected:**
- Director nhận thông báo "Có báo giá mới cần phê duyệt"

---

### TC-07-08: Thông báo khi được phân công task

**Steps:**
1. PM phân công task cho tech@test.com
2. GET notifications với token tech@test.com

**Expected:**
- Tech nhận thông báo về task mới được giao

---

### TC-07-09: Thông báo khi task đến deadline

> Cần scheduler hoặc test logic riêng  
**Steps:**
1. Tạo task có `end_time = today`
2. Kích hoạt job kiểm tra deadline

**Expected:**
- Assignee nhận thông báo deadline hôm nay

---

### TC-07-10: Đánh dấu thông báo đã đọc

**Steps:**
1. GET notifications — có thông báo chưa đọc
2. PATCH `/api/v1/notifications/{id}` hoặc POST mark-read
3. GET lại

**Expected:**
- Thông báo chuyển sang `is_read = true`

---

### TC-07-11: WebSocket nhận thông báo realtime

> Test thủ công  
**Steps:**
1. Mở app trên trình duyệt, đăng nhập director
2. Trên tab khác (hoặc Postman): advance báo giá lên S2
3. Quan sát trình duyệt

**Expected:**
- Toast/badge thông báo xuất hiện ngay lập tức không cần reload

---

## Checklist tổng

### Hợp đồng
- [ ] TC-07-01 Tạo hợp đồng từ S9
- [ ] TC-07-02 Không tạo từ báo giá chưa S9
- [ ] TC-07-03 Xem danh sách
- [ ] TC-07-04 Cập nhật hợp đồng
- [ ] TC-07-05 Theo dõi thanh toán
- [ ] TC-07-06 Thanh toán không vượt giá trị

### Thông báo
- [ ] TC-07-07 Thông báo chuyển giai đoạn báo giá
- [ ] TC-07-08 Thông báo phân công task
- [ ] TC-07-09 Thông báo deadline
- [ ] TC-07-10 Đánh dấu đã đọc
- [ ] TC-07-11 WebSocket realtime (UI)

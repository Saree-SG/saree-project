# TC-02: Quản lý Báo giá (Quotation)

## Điều kiện tiên quyết
- DB test đã seed
- Tài khoản: director@test.com, sales@test.com, tech@test.com

---

## LUỒNG CHÍNH: S1 → S9 (Happy Path)

### TC-02-01: Tạo báo giá mới (S1_INIT)

**Actor:** sales@test.com (Sales Manager)  
**Steps:**
1. Đăng nhập sales@test.com
2. POST `/api/v1/quotations/` với body:
   ```json
   {
     "title": "Báo giá điện lạnh VP ABC",
     "client_name": "Công ty ABC",
     "description": "Lắp đặt hệ thống điện lạnh văn phòng 3 tầng"
   }
   ```

**Expected:**
- HTTP 201
- `status = "S1_INIT"`
- `created_by` = id của sales user

---

### TC-02-02: Chuyển sang S2 — GĐ duyệt khảo sát

**Steps:**
1. Sales: POST `/api/v1/quotations/{id}/advance` (hoặc action tương ứng)

**Expected:**
- `status = "S2_DIRECTOR_APPROVE_SURVEY"`
- Thông báo gửi đến director

---

### TC-02-03: Director phê duyệt khảo sát → S3

**Actor:** director@test.com  
**Steps:**
1. POST `/api/v1/quotations/{id}/approve`

**Expected:**
- `status = "S3_TECH_DESIGN"`

---

### TC-02-04: Kỹ thuật hoàn thiện thiết kế

**Actor:** tech@test.com  
**Steps:**
1. PATCH `/api/v1/quotations/{id}` — cập nhật bản vẽ/file đính kèm
2. POST `/api/v1/quotations/{id}/submit-design`

**Expected:**
- `status = "S4_DIRECTOR_APPROVE_DESIGN"`

---

### TC-02-05: Director phê duyệt thiết kế → S5

**Actor:** director@test.com  
**Steps:**
1. POST `/api/v1/quotations/{id}/approve`

**Expected:**
- `status = "S5_PROCUREMENT_PRICING"`

---

### TC-02-06: Nhập giá vật tư → S6

**Steps:**
1. POST `/api/v1/quotations/{id}/submit-pricing`

**Expected:**
- `status = "S6_SALES_FINALIZE"`

---

### TC-02-07: Sales hoàn thiện báo giá → S7

**Actor:** sales@test.com  
**Steps:**
1. PATCH báo giá — cập nhật tổng giá trị, điều khoản
2. POST `/api/v1/quotations/{id}/finalize`

**Expected:**
- `status = "S7_DIRECTOR_APPROVE_QUOTE"`

---

### TC-02-08: Director phê duyệt báo giá → S8

**Actor:** director@test.com  
**Steps:**
1. POST `/api/v1/quotations/{id}/approve`

**Expected:**
- `status = "S8_SENT_TO_CLIENT"`

---

### TC-02-09: Gửi cho khách, khách đồng ý → S9

**Steps:**
1. POST `/api/v1/quotations/{id}/client-accept`

**Expected:**
- `status = "S9_CONTRACT"`

---

## LUỒNG PHỤ: Từ chối & chỉnh sửa

### TC-02-10: Director từ chối thiết kế → S3B

**Steps:**
1. Tại S4, director POST `/api/v1/quotations/{id}/reject`

**Expected:**
- `status = "S3B_TECH_REVISE"`

---

### TC-02-11: Kỹ thuật chỉnh sửa xong → quay lại S4

**Steps:**
1. Tại S3B, tech POST `/api/v1/quotations/{id}/resubmit`

**Expected:**
- `status = "S4_DIRECTOR_APPROVE_DESIGN"`

---

### TC-02-12: Khách yêu cầu đàm phán → S8B

**Steps:**
1. Tại S8, POST `/api/v1/quotations/{id}/negotiate`

**Expected:**
- `status = "S8B_NEGOTIATION_REVIEW"`

---

### TC-02-13: Sau đàm phán → quay về S6 chỉnh giá

**Steps:**
1. Tại S8B, director POST approve (review xong)

**Expected:**
- `status = "S6_SALES_FINALIZE"` (vòng lặp chỉnh giá lại)

---

## MULTI-APPROVER

### TC-02-14: Thêm co-approver tại giai đoạn S2

**Actor:** director@test.com  
**Steps:**
1. Báo giá đang ở S2
2. POST `/api/v1/quotations/{id}/approval-participants` với:
   ```json
   { "user_id": "...", "participant_type": "co_approver" }
   ```

**Expected:**
- HTTP 201
- Participant được tạo với `approved = false`

---

### TC-02-15: Co-approver phê duyệt — GĐ chưa duyệt → chưa chuyển giai đoạn

**Steps:**
1. Co-approver POST approve
2. GET quotation

**Expected:**
- `status` vẫn là S2 (GĐ chưa duyệt)

---

### TC-02-16: GĐ duyệt sau co-approver → chuyển giai đoạn

**Steps:**
1. Director POST approve

**Expected:**
- `status = "S3_TECH_DESIGN"` (tất cả đã duyệt → tự động chuyển)

---

### TC-02-17: GĐ duyệt trước co-approver → chưa chuyển giai đoạn

**Steps:**
1. Tạo báo giá mới tại S2, thêm co-approver
2. Director duyệt trước
3. GET quotation

**Expected:**
- `status` vẫn S2 (co-approver chưa duyệt)

---

### TC-02-18: Co-approver duyệt sau GĐ → tự chuyển giai đoạn

**Steps:**
1. Co-approver POST approve

**Expected:**
- `status = "S3_TECH_DESIGN"` (tất cả đã duyệt)

---

### TC-02-19: Xóa co-approver khi GĐ đã duyệt → tự chuyển giai đoạn

**Steps:**
1. Tạo tình huống: GĐ đã duyệt, co-approver chưa duyệt → vẫn ở S2
2. DELETE `/api/v1/quotations/{id}/approval-participants/{participant_id}`

**Expected:**
- HTTP 200
- Quotation tự động chuyển sang S3 (không cần action thêm)

---

### TC-02-20: Thêm delegate

**Steps:**
1. POST participant với `participant_type = "delegate"`
2. Delegate POST approve

**Expected:**
- Chỉ cần delegate duyệt (không cần GĐ gốc) → chuyển giai đoạn

---

### TC-02-21: User không phải director/participant cố approve → bị từ chối

**Steps:**
1. sales@test.com POST approve tại giai đoạn duyệt của GĐ

**Expected:**
- HTTP 403

---

## Checklist tổng
- [ ] TC-02-01 Tạo báo giá S1
- [ ] TC-02-02 Chuyển sang S2
- [ ] TC-02-03 GĐ duyệt → S3
- [ ] TC-02-04 Kỹ thuật submit → S4
- [ ] TC-02-05 GĐ duyệt thiết kế → S5
- [ ] TC-02-06 Nhập giá → S6
- [ ] TC-02-07 Sales finalize → S7
- [ ] TC-02-08 GĐ duyệt báo giá → S8
- [ ] TC-02-09 Khách đồng ý → S9
- [ ] TC-02-10 Từ chối thiết kế → S3B
- [ ] TC-02-11 Chỉnh sửa xong → S4
- [ ] TC-02-12 Đàm phán → S8B
- [ ] TC-02-13 Sau đàm phán → S6
- [ ] TC-02-14 Thêm co-approver
- [ ] TC-02-15 Co-approver duyệt trước GĐ → chưa chuyển
- [ ] TC-02-16 GĐ duyệt sau → chuyển
- [ ] TC-02-17 GĐ duyệt trước → chưa chuyển
- [ ] TC-02-18 Co-approver duyệt sau → chuyển
- [ ] TC-02-19 Xóa co-approver khi GĐ đã duyệt → tự chuyển
- [ ] TC-02-20 Delegate duyệt thay GĐ
- [ ] TC-02-21 User không đủ quyền approve bị từ chối

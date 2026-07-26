# Plan: Gantt view tổng quan theo UI demo khách

**Ngày:** 2026-07-25
**Bối cảnh:** Khách xem demo `docs/reference/demo-quan-ly-du-an-source.txt` và thích UI Gantt trong đó hơn Gantt hiện tại của hệ thống.

> **CẬP NHẬT (2026-07-25, sau khi xem thực tế):** kết luận ban đầu bên dưới ("không
> thay SVAR") **đã bị thay thế**. Khách thích UI demo nên đã chuyển toàn bộ sang
> style demo và **bỏ hẳn SVAR** — cả cấp dự án lẫn cấp task giờ dùng một engine
> `TimelineChart` DOM thuần. Xem `docs/plan-gantt-bo-svar.md`.

**Kết luận định hướng (đã lỗi thời):** Không thay SVAR. Thêm một view "Tổng quan dự án" port đúng UI demo, giữ SVAR làm view "Chi tiết task".

---

## 1. Đối chiếu hai thứ

Hai cái này **không cùng loại**, nên "demo hơn" là hơn về UX đọc nhanh, không phải hơn về chức năng.

| | Demo (`ganttHTML()` + `initGantt()`) | Hệ thống hiện tại (`components/Gantt/`) |
|---|---|---|
| Thư viện | Vanilla JS, ~120 dòng (source dòng 1176–1300) | `@svar-ui/react-gantt` |
| 1 hàng = | 1 **dự án** | 1 **task** (có cây parent/child) |
| Trục | Tuần cố định 80px, không zoom | Ngày / Tuần / Tháng |
| Dependency | Không | Có (`e2s/e2e/s2s/s2e`) |
| Critical path | Không | Có |
| Sửa lịch | Không (read-only) | Drag resize/move → PATCH debounce 800ms |
| Nhóm / lọc | Không | Nhóm theo người/tổ/trạng thái/dự án + lọc + export PNG |
| Dữ liệu | localStorage giả | API thật |

### Demo mạnh hơn ở 4 điểm UX (đây là cái khách thấy)

1. **Needle + date-tip dính** (`.gantt-needle`, `.gantt-date-tip`): vạch vàng ghim ở 32% chiều rộng khung, kéo ngang thì tooltip hiện ngày đang trỏ. Điểm ăn tiền nhất trên điện thoại — không cần nhìn header vẫn biết đang ở ngày nào.
2. **Auto-scroll tới hôm nay ngay khi mở**: `scrollToToday()` được gọi lặp qua `requestAnimationFrame` + `setTimeout(80)` + `setTimeout(250)` để chống layout chưa xong. Hệ thống mình có nút "Hôm nay" nhưng phải bấm, và `GanttView.tsx:196-215` scroll bằng cách **đoán** `days * cellWidth` từ task đầu tiên → lệch khi có group row.
3. **Nhãn gọn, thông tin dày**: cột nhãn 150px (tên KH + khoảng ngày), còn trên thanh bar in `số ngày` / `tên việc` / `%` **có điều kiện theo bề rộng bar** (`w>28`, `w>24`, `w>52`) nên không bao giờ tràn. Mình đang dùng grid 3 cột (320+110+80 px) → ăn hết màn hình điện thoại.
4. **Sync scroll thủ công từng hàng** (`.gantt-sync`) + `touch-action: pan-x pan-y`: vừa kéo ngang vừa cuộn dọc trang được. SVAR bắt scroll trong container `height: 640` cứng (`GanttView.tsx:220`) → trên mobile thành "hộp trong hộp", rất khó cuộn.

### Demo yếu hơn ở

Dữ liệu giả; không task con / dependency / critical path; không sửa được lịch; progress = trung bình cộng thô các assignment; cột nhãn cứng 150px (tên dài bị cắt còn `—`); không zoom.

→ Đổi hẳn sang implementation kiểu demo là **mất drag-to-reschedule, dependency, critical path** — những thứ đã có backend hậu thuẫn (`updateTaskTimeline`, `addDependency`). Không làm.

---

## 2. Quyết định cần chốt trước khi code

### 2.1 Cột nhãn hiển thị gì? (BLOCKER nhẹ)

Demo hiển thị **tên khách hàng viết tắt** (`ganttCompanyLbl` → `projCompanyShort`). Hệ thống mình **`Project` chưa có link tới `CustomerCompany`** — `customer_company_id` hiện chỉ tồn tại trên `models/attendance.py:36`. Ba lựa chọn:

- **(A) Dùng `project.code` + `project.name`** — làm được ngay, không đụng schema. Đề xuất mặc định.
- **(B) Thêm `Project.customer_company_id` nullable + migration** — đúng ý demo nhất, nhưng phát sinh việc gán khách cho dự án cũ. ~1 ngày thêm.
- **(C) Làm (A) trước, (B) sau** nếu khách khẳng định phải thấy tên KH.

### 2.2 Progress cấp dự án tính thế nào?

Đã có `_rollup_completion_pct()` (`services/task_service.py:206`) — WBS weighted, đệ quy N cấp, chuẩn hơn trung bình cộng của demo. **Dùng lại cái này**, aggregate các task gốc của dự án.

⚠️ Hàm này gọi `repo.get_by_id` / `get_children` / `sum_progress` theo từng node → **N+1 nặng**. Với view liệt kê *toàn bộ* dự án thì không dùng trực tiếp được. Cần một hàm batch: load hết task của các dự án trong 1 query, dựng cây trong memory, rồi rollup. Tính vào ước lượng bước 1.

---

## 3. Các bước triển khai

### Bước 1 — Backend: endpoint cho view tổng quan (~1 ngày)

`GET /api/v1/projects/timeline`

Query params: `company_id?`, `department_id?`, `include_completed=false`

Response:
```json
[{
  "id": "...", "code": "PRJ-001", "name": "...",
  "start_date": "2026-06-01", "end_date": "2026-08-15",
  "progress": 42, "status": "active",
  "department_id": "...", "department_name": "..."
}]
```

- `start_date` / `end_date` lấy trực tiếp từ `Project` — **đã là NOT NULL** (`models/project.py:23-24`), nên không cần logic fallback phức tạp như `projTL()` của demo.
- Mặc định lọc `status not in (completed, cancelled)` — tương ứng `S.proj.filter(p.status!=="done")` của demo.
- `progress`: hàm rollup **batch** mới (xem 2.2).

Không dùng `fetchCompanyGantt` — nó trả về từng task, quá nặng cho view 1-hàng-1-dự-án.

**File:** `backend/app/api/routes/projects.py` (route mới), `backend/app/services/task_service.py` (hàm rollup batch).

### Bước 2 — Frontend: component `ProjectTimeline` (~1.5 ngày)

**File mới:** `frontend/src/components/Gantt/ProjectTimeline.tsx` + `project-timeline.css`. Div thuần, không phụ thuộc SVAR.

Port nguyên xi từ demo:

- Trục tuần 80px, nhãn `dd/MM-dd/MM` (`dFmtGanttWeek`)
- **Padding timeline:** `-1 tuần` trước min, `+14 ngày` sau max, **tối thiểu 5 tuần** (source dòng 1222–1227). Chi tiết nhỏ này khiến chart không bao giờ trông trống — dễ bỏ sót.
- Cột nhãn 150px: nhãn (theo 2.1) + khoảng ngày; click → điều hướng chi tiết dự án
- Bar: bg mờ (`col+"28"`) + fill progress gradient; in `số ngày` / `tên việc` / `%` **có điều kiện bề rộng** (`w>28`, `w>24`, `w>52`)
- **Needle vàng ghim 32% + date-tip**
- **Sync scroll giữa các hàng** (`.gantt-sync`), `touch-action: pan-x pan-y` — KHÔNG dùng một container scroll lớn
- **`scrollToToday()` gọi lặp** qua rAF + `setTimeout` 80/250ms — giữ nguyên "hack" này, đây là lý do demo mở lên đã đúng vị trí

Hai chỗ **cố tình làm khác demo**:
- Màu bar lấy từ design token của hệ thống, không hardcode `groupColor`
- Cột nhãn `clamp()` thay vì cứng 150px, để tên dài không bị cắt cụt thành `—`

### Bước 3 — Gắn vào UI (~0.5 ngày)

- **Dashboard**: card "Tiến độ dự án (Gantt)" — đúng vị trí demo đặt (source dòng 2975)
- **`/gantt`** (`routes/_layout/gantt.tsx`): thêm 2 tab — *Tổng quan* (ProjectTimeline, **mặc định**) / *Chi tiết task* (SVAR hiện tại). Khách vào là thấy UI họ thích; PM vẫn kéo lịch được.
- **Mobile**: dưới breakpoint `md` ép về tab Tổng quan (lý do: SVAR `height: 640` cứng).

### Bước 4 — Vá SVAR view (~0.5 ngày, làm sau khi khách xác nhận bước 1–3)

Mượn lại 3 thứ từ demo, không đổi thư viện:
- Needle + date-tip overlay
- Auto-scroll-to-today đáng tin cậy — thay phép đoán `days * cellWidth` (`GanttView.tsx:196-215`) bằng đọc scale range thật từ SVAR api
- `height: 640` → `min(70vh, 640px)`; ẩn cột "Bắt đầu" / "Số ngày" dưới `md`

---

## 4. Ước lượng & rủi ro

**Tổng: ~3.5 ngày** (thêm ~1 ngày nếu chốt phương án (B) ở 2.1).

Rủi ro thấp: không đụng SVAR, không đụng schema (trừ khi chọn (B)), chỉ thêm 1 endpoint đọc.

Rủi ro cần để ý:
- **Performance rollup progress** — điểm duy nhất có thể trượt ước lượng. Nếu hàm batch phức tạp hơn dự kiến, tạm trả `progress` tính thô (trung bình task gốc) cho bản demo khách xem, rồi thay bằng WBS weighted sau.
- **Sync scroll + sticky header trên iOS Safari** — demo đã chạy được nên rủi ro thấp, nhưng cần test thật trên máy, không chỉ devtools.

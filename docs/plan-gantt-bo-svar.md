# Đổi toàn bộ Gantt sang UI kiểu demo — bỏ SVAR (ĐÃ XONG)

**Ngày:** 2026-07-25
**Thay thế cho:** kết luận "giữ SVAR" trong `docs/plan-gantt-timeline-theo-demo.md`

## Vì sao

Khách thích UI Gantt của demo (`docs/reference/demo-quan-ly-du-an-source.txt`) hơn SVAR. Sau khi làm view "Tổng quan dự án" theo style demo và xem thực tế, chốt đổi luôn cả cấp task sang style đó và bỏ `@svar-ui/react-gantt`.

## Kiến trúc sau khi đổi

```
TimelineChart.tsx        engine dùng chung — trục tuần, needle + date-tip, sync scroll
  ├── ProjectTimeline    1 hàng = 1 dự án   (dashboard, tab Tổng quan)
  └── TaskTimeline       cây task           (/gantt, /projects/$id, /dashboard/personnel/$id)
```

`TimelineChart` giữ nguyên các "hack" của demo vì đó chính là thứ tạo cảm giác mượt:
- `centerToday()` gọi lặp qua rAF + `setTimeout` 80/250ms — lần paint đầu scroller còn `clientWidth = 0`, gọi một lần sẽ âm thầm nằm ở scrollLeft 0.
- Mỗi hàng một scroller riêng, sync bằng JS + `touch-action: pan-x pan-y` — một container scroll lớn sẽ bắt giữ cuộn dọc trên mobile.
- Padding trục: −1 tuần / +14 ngày / sàn 5 tuần — chart không bao giờ trông trống.
- Nhãn trên bar hiện theo bề rộng (`>28` số ngày, `>24` tên, `>52` phần trăm).

## Được / mất so với SVAR

| | Trạng thái |
|---|---|
| Critical path | Giữ — bar đỏ |
| Task bị chặn | Giữ — bar hổ phách + tooltip "Đang bị chặn" |
| Sửa lịch task | Giữ — click task mở dialog `TaskQuickEdit` (start/end/progress/status) |
| Thêm/xoá dependency | Giữ — đã có ở trang chi tiết task (`tasks.$taskId.tsx`) |
| Zoom | Giữ, và **hơn demo** — `WEEK_PX_BY_SCALE` (Phóng to 160px / Vừa 80 / Thu nhỏ 40) |
| **Kéo bar để đổi lịch** | **Mất** |
| **Mũi nối dependency giữa các bar** | **Mất** |
| Nhóm theo người/tổ (`groupBy`) | Bỏ — cây task đã là cách nhóm |

## Đã thay đổi

**Thêm:** `TimelineChart.tsx`, `TaskTimeline.tsx`, `ProjectTimelineCard.tsx`, `timeline-chart.css`
**Xoá:** `GanttView.tsx`, `gantt-overrides.css`, dependency `@svar-ui/react-gantt`
**Rút gọn:** `transformers.ts` (bỏ `applyGrouping`/`buildSvarTasks`/`buildSvarLinks`/`toGanttLink`/`applyFilter` — chỉ còn `toGanttRow`), `types.ts` (bỏ `GanttLink`, `GanttGroupBy`), `GanttToolbar.tsx` (bỏ select "Nhóm theo", scale → zoom)
**Rewire:** `ProjectGanttV2.tsx`, `routes/_layout/gantt.tsx`, `routes/_layout/dashboard.personnel.$userId.tsx`

Bỏ luôn việc ép mobile về tab Tổng quan — lý do ép trước đây là `height: 640` cứng của SVAR.

## Backend (từ giai đoạn trước, vẫn dùng)

- `GET /api/v1/projects/timeline` — 1 hàng/dự án, không phân trang (phân trang phá trục thời gian dùng chung)
- `rollup_progress_for_projects()` (`services/task_service.py`) — WBS weighted, batch 2 query thay cho bản per-node N+1
- Seed test: `python -m app.scripts.seed_timeline_demo [--wipe]` — 10 dự án `TLD-*` phủ các ca biên

## Đã chạy thật và sửa (2026-07-26)

Mở app kiểm bằng mắt, phát hiện và sửa:

- **Nhãn lệch:** dòng tên bị chỗ trống của mũi ▶ đẩy phải 17px còn dòng ngày thì không → hai dòng so le, trông như canh giữa, thụt cấp cây không đọc được. Đã gộp tên + ngày vào `.tlc-lbl-text` chung một lề.
- **Badge ngày đè hàng đầu tiên:** thêm biến `--tlc-tip-h` dành riêng một dải 18px dưới thanh tuần.
- **Chữ trên bar chồng nhau:** 3 phần tử absolute (`tên`/`N ngày`/`%`) đè lên nhau với tên task thật → đổi sang flex row.
- **`58ng 0%` không đọc được** trên phần bar nhạt → thêm chip nền tối.
- **Needle chỉ sai ngày:** pin cố định ở 32% trỏ vào ngày vô nghĩa khi không thể cuộn hôm nay xuống dưới pin. Giờ needle nằm trên hôm nay khi hôm nay còn trong khung, chỉ quay về pin đọc-ngày khi hôm nay bị cuộn ra ngoài.
- **PNG xuất sai khoảng ngày:** `html-to-image` clone node với `scrollLeft = 0` nên thanh tuần in từ đầu timeline còn needle giữ vị trí px của view đã cuộn → ảnh có needle chỉ sai ngày. Đã thêm `prepareTimelineExport()` + class `.tlc-exporting`: bung toàn bộ scroller, ẩn needle/tip, xuất **cả timeline** rồi restore. Xác nhận ảnh 7260×1504px đúng.
- **Task không bấm được** ở `/gantt` và `/dashboard/personnel` (thiếu `onTaskClick`) → giờ điều hướng sang `/tasks/$taskId`, và **bấm được cả trên bar** chứ không chỉ ở nhãn.
- **Tab Tổng quan không có filter** → thêm lọc theo trạng thái + "Hiện cả dự án đã xong / huỷ".

## Phạm vi xem (quyền)

`/projects/timeline` ban đầu copy quy tắc `list_for_user` (chỉ dự án mình là thành viên) nên Giám đốc chỉ thấy 1 dự án. Đã đổi theo mô hình công ty → dự án → task: **role cấp công ty level 1–2 thấy toàn bộ dự án của công ty**, còn lại chỉ thấy dự án mình thuộc về. Dùng helper mới `has_company_wide_scope()` trong `app/shared/permission.py`, theo đúng pattern đã có ở `task_ws.py`. Xác nhận: Giám đốc giờ thấy 9 dự án.

## Còn hở

- **Không virtualize.** Dự án vài trăm task sẽ render hết số hàng. Cần cân nhắc virtualization nếu gặp.
- **PNG với timeline dài thì chậm** (~10s cho 44 tuần, ảnh 7260px). Chấp nhận được, nhưng nếu cần nhanh hơn thì giảm `pixelRatio` từ 2 xuống 1.

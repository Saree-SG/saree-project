# Gantt Refactor Plan

> Trạng thái tổng thể: **🎉 Toàn bộ 5 Phases hoàn tất ✓**
> Ngày tạo: 2026-05-25
> Owner: vntuananh

## Quyết định đã chốt

| # | Câu hỏi | Quyết định |
|---|---------|-----------|
| 1 | Library | `wx-react-gantt` (SVAR React Gantt, MIT) |
| 2 | Features ưu tiên | Zoom day/week/month + scroll-to-today; Group/swimlane theo assignee/phòng ban + filter; Bar có avatar + % progress |
| 3 | Scope | Cả 3: `projects/:id` (chính), `dashboard/personnel/:userId`, trang mới `/gantt` (toàn công ty) |
| 4 | Triển khai | Plan trước → review → code |

## Tại sao Gantt hiện tại khó dùng

| Vấn đề | Hiện trạng | Khắc phục |
|---|---|---|
| Không zoom | 28px/ngày cứng | SVAR có scale day/week/month/year built-in |
| Drag hạn chế | Chỉ drag end date | SVAR drag start + end + move cả bar |
| Phải mở modal để edit | Click bar → mở trang khác | Side-panel edit nhanh trên Gantt |
| Không thấy ai làm | Chỉ tên text | Avatar + name + role trên bar |
| % progress mỏng | Inner bar fill 2-3px | Progress bar dày + label số % |
| Không group | Flat list | Swimlane theo assignee/dept |
| Không filter | Hiển thị tất cả | Toolbar filter status/assignee/critical |

---

## Kiến trúc đề xuất

### Component shared: `components/Gantt/GanttView.tsx`
Wrap `wx-react-gantt` thành 1 component thống nhất dùng được ở cả 3 trang:

```tsx
type GanttViewProps = {
  tasks: GanttTask[]
  links: GanttLink[]
  scale?: "day" | "week" | "month"
  groupBy?: "none" | "assignee" | "department" | "status"
  filter?: {
    status?: string[]
    assigneeIds?: string[]
    criticalOnly?: boolean
  }
  onTaskUpdate?: (taskId, patch) => void   // drag → PATCH
  onTaskClick?: (taskId) => void           // mở side panel
  onLinkAdd?: (from, to) => void
  onLinkRemove?: (linkId) => void
  readOnly?: boolean
}
```

### Toolbar: `components/Gantt/GanttToolbar.tsx`
- Select scale (Ngày / Tuần / Tháng)
- Button "Hôm nay" — scroll to today
- Select groupBy
- Multi-select filter status + assignee + checkbox "Chỉ critical path"
- Button export PNG (dùng `html-to-image` đã có)

### Side panel: `components/Gantt/TaskQuickEdit.tsx`
Click vào bar mở `Sheet` bên phải:
- Tên, mô tả
- Start date, end date (date pickers)
- Status select
- Assignee select
- Progress slider 0-100%
- Link "Mở trang detail đầy đủ"
- Save → PATCH /tasks/{id}

### Bar custom renderer
SVAR cho phép custom slot cho bar. Render:
```
[Avatar 20px] Tên task             [40%]
[========progress fill========·    ]
```

---

## Backend changes

### Mở rộng `GET /api/v1/projects/{id}/gantt`
Hiện trả về `tasks` + `dependencies`. Cần thêm cho mỗi task:
- `assignee_avatar_initials` (đã có `assignee_name`)
- `department_id` + `department_name` (cho group)
- Giữ nguyên `is_on_critical_path`, `reported_progress_total`, `blocked_by`

### Endpoint mới: `GET /api/v1/dashboard/gantt`
Cho trang `/gantt` toàn công ty:
- Query params: `company_id` (required), `start_date`, `end_date`, `project_ids[]`, `assignee_ids[]`, `department_id`
- Trả về tasks across multiple projects với `project_id` + `project_name` để group
- Permission: `REPORT_VIEW_ALL` hoặc `REPORT_VIEW_TEAM`

### Endpoint mới: `GET /api/v1/users/{user_id}/gantt`
Cho `dashboard/personnel/:userId`:
- Trả về tasks user được assign + dependencies giữa chúng
- Có thể filter date range

---

## Phases

### Phase A — Foundation (lib + GanttView wrapper)
**Trạng thái:** ✅ Hoàn tất (2026-05-25)

- [x] `wx-react-gantt: ^2.1.4` thêm vào `package.json`
- [x] `components/Gantt/types.ts` — `GanttRow`, `GanttLink`, `GanttScale`, `GanttGroupBy`, `GanttFilter`
- [x] `components/Gantt/transformers.ts` — `toGanttRow`, `toGanttLink`, `applyFilter`, `applyGrouping` (virtual summary rows), `toSvarTask`, `toSvarLink`
- [x] `components/Gantt/GanttView.tsx` — wrap SVAR `<Gantt>` với `Willow` theme, 3 scale preset (day/week/month), columns "Công việc / Bắt đầu / Số ngày", events `update-task / select-task / add-link / delete-link`, scroll-to-today fallback
- [x] `components/Gantt/GanttToolbar.tsx` — scale select, groupBy select (option `project`/`department` conditional), filter dropdown với status + assignee + critical-only, nút "Hôm nay"
- [x] `components/Gantt/TaskQuickEdit.tsx` — Sheet phải, edit name + status + dates + progress slider, save 1 lần qua `TasksService.updateTask`, link sang trang đầy đủ
- [x] Mode `readOnly` (SVAR `readonly` + `editorShape.fields=[]`)

**Quyết định mặc định cho 5 câu chưa chốt:**
1. Trang `/gantt` mới đặt ở đâu trong sidebar → quyết định ở Phase D
2. Drag → debounce ở consumer (Phase B), GanttView chỉ emit event
3. Side panel: chỉ status + dates + progress + name (tối giản)
4. Critical path: giữ đỏ, badge "Critical path" trong QuickEdit panel
5. Bar avatar: dùng initials (User chưa có `avatar_url`)

**Lưu ý chạy:**
- `cd frontend && npm install` để cài `wx-react-gantt`

### Phase B — Refactor projects/:id Gantt
**Trạng thái:** ✅ Hoàn tất (2026-05-25)

- [x] Backend: thêm `assignee_department_id` + `assignee_department_name` vào `TaskPublic` (lookup từ `assignee.department_id` trong `_enrich`)
- [x] Frontend `GanttTask` type + transformer mapped 2 field mới
- [x] `components/Gantt/ProjectGanttV2.tsx` mới — wire `GanttView` + `GanttToolbar` + `TaskQuickEdit`
- [x] Drag → debounce 800ms → `updateTaskTimeline` (start + end)
- [x] Click bar → mở `TaskQuickEdit` Sheet với row data
- [x] Link add → `addDependency`, Link remove → `removeDependency`
- [x] `enableDepartmentGroup` bật cho project view
- [x] Swap `routes/_layout/projects.$projectId.tsx` import sang `ProjectGanttV2`

**Đã pass `assignee_id` qua transformer** (TaskPublic đã có sẵn field này).

**Giữ lại file cũ:** `components/Gantt/ProjectGantt.tsx` (613 dòng) không xoá để tránh phá tham chiếu khác — sẽ dọn ở Phase E.

**Lưu ý chạy:**
- Restart backend (load field mới của TaskPublic)
- Frontend tự HMR; vào `/projects/{id}` chọn tab Gantt để xem

### Phase C — Personnel Gantt (dashboard/personnel/:userId)
**Trạng thái:** ✅ Hoàn tất (2026-05-25)

- [x] Backend: `GET /api/v1/dashboard/users/{user_id}/gantt` — tasks user được assign trong scope visible projects + dependencies giữa chúng + progress từ TaskProgressReport
- [x] Frontend `fetchUserGantt` API trong `modules/gantt/ganttApi.ts`
- [x] Thay compact bar chart trong `dashboard.personnel.$userId.tsx` bằng `<GanttView readOnly />` + `<GanttToolbar enableProjectGroup />`
- [x] Default scale = `week`, default groupBy = `project`
- [x] Xoá helper `computeTaskRanges` + `formatShortDate` + type `PersonnelTask` cũ (unused)

**Note:** color theo project chưa làm — SVAR Gantt theme `Willow` dùng màu thống nhất; có thể custom sau ở Phase E nếu cần.

**Lưu ý chạy:**
- Restart backend (load endpoint mới)
- Vào `/dashboard/personnel/{userId}` test

### Phase D — Trang mới `/gantt` toàn công ty
**Trạng thái:** ✅ Hoàn tất (2026-05-25)

- [x] Backend `GET /api/v1/dashboard/gantt` — multi-project, filter `project_id` / `department_id` / `assignee_id` / `start_date` / `end_date`, scope theo `REPORT_VIEW_ALL`/`REPORT_VIEW_TEAM` (qua `_project_ids_scope`)
- [x] Frontend `fetchCompanyGantt` API
- [x] Route mới `routes/_layout/gantt.tsx`
- [x] Sidebar nav top-level "Gantt tổng" với icon `CalendarRange` (chỉ hiện khi `showManagement`)
- [x] Filter bar server-side: công ty + phòng ban + dự án + date range
- [x] Toolbar client-side: scale + groupBy (project & department) + filter status/assignee/critical
- [x] Default scale `month`, default groupBy `project`
- [x] Permission ngầm qua `dashboard` router (đã có `REPORT_VIEW_ALL/TEAM` dependency)

**Lưu ý chạy:**
- Restart backend (endpoint mới)
- Truy cập `/gantt` — chỉ hiện trong sidebar nếu user có quyền `REPORT_VIEW_*`

### Phase E — Polish
**Trạng thái:** ✅ Hoàn tất (2026-05-25)

- [x] Xoá `components/Gantt/ProjectGantt.tsx` cũ (613 dòng, unused sau Phase B)
- [x] `GanttView` convert sang `forwardRef<GanttViewHandle>` (expose `getElement()` cho PNG export)
- [x] Export PNG button trong `GanttToolbar` — dynamic import `html-to-image`
- [x] Wire `getExportElement` ở `ProjectGanttV2` và `/gantt` page
- [x] Empty state đã có ở Phase B-D (table trống / loading có cả)
- [ ] Print stylesheet, tooltip custom, keyboard shortcut — skip (SVAR Willow theme có tooltip built-in; nhỏ giọt)
- [ ] Color theo project — skip (SVAR cssClass setup phức tạp, tooltip + groupBy đã đủ trực quan)

**Lưu ý:** Personnel Gantt (`dashboard/personnel/:userId`) chưa wire export PNG vì page đó context khác. Có thể thêm sau.

---

## Câu hỏi cần chốt trước khi code Phase A

1. **Trang `/gantt` mới đặt ở đâu trong sidebar?** Một item mới ngang Dashboard? Hay con của Dashboard?
2. **Drag move bar có gọi backend ngay không?** Tôi đề xuất: debounce 800ms rồi PATCH. Hoặc bắt sự kiện "drop" cuối cùng.
3. **Side panel quick edit** có cần thêm trường `parent_task_id`, `priority` không? Hay chỉ status + dates + assignee + progress?
4. **Color critical path**: giữ đỏ như cũ hay đổi sang phối khác (đỏ trong SVAR có thể đụng style mặc định của lib)?
5. **Bar có hiện avatar** — `User` model có field `avatar_url` không? Nếu không thì dùng initials (như nơi khác đã làm)?

Trả lời 5 câu trên rồi tôi bắt Phase A.

---

## Changelog

- 2026-05-25: Plan tạo. Chờ review + 5 câu chốt.
- 2026-05-25: Phase A hoàn tất — 5 file mới trong `components/Gantt/` (types, transformers, GanttView, GanttToolbar, TaskQuickEdit) + dep `wx-react-gantt`. Dùng default cho 5 câu chốt.
- 2026-05-25: Phase B hoàn tất — backend thêm `assignee_department_id/name` vào TaskPublic; tạo `ProjectGanttV2.tsx` wire toàn bộ Gantt mới; swap import ở `projects.$projectId.tsx`. Drag debounce 800ms.
- 2026-05-25: Phase C hoàn tất — endpoint `/dashboard/users/{id}/gantt`; trang `dashboard.personnel.$userId` dùng GanttView readOnly group by project; dọn compact bar chart cũ.
- 2026-05-25: Phase D hoàn tất — endpoint `/dashboard/gantt` multi-project + filter; trang mới `/gantt` với filter bar server-side + toolbar client-side; sidebar nav top-level "Gantt tổng" cho user có quyền report.
- 2026-05-25: Phase E hoàn tất — xoá ProjectGantt cũ 613 dòng; Export PNG button (forwardRef + dynamic import html-to-image) wire ở project và company gantt page. Toàn bộ Gantt refactor hoàn tất.

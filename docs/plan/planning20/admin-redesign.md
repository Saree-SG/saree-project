# Admin Redesign Plan

> Trạng thái tổng thể: **🎉 Toàn bộ 6 Phases hoàn tất ✓**
> Ngày tạo: 2026-05-24
> Owner: vntuananh

## Quyết định đã chốt

| # | Câu hỏi | Quyết định |
|---|---------|-----------|
| 1 | Stats scope | Build backend mới (session, login frequency, active users) |
| 2 | Edit user UX | Trang riêng `/admin/users/:id` với tabs |
| 3 | Org tree UI | Org chart ngang (boxes + lines) — dùng `react-organizational-chart` |
| 4 | Triển khai | Plan chi tiết trước, làm từng phase, update plan khi xong |

## Sitemap mới

```
/admin                        → redirect tới /admin/overview
/admin/overview               → System Info (stats + charts)
/admin/users                  → User list (bảng chi tiết, filter)
/admin/users/:userId          → User detail page (tabs)
/admin/organization           → Org chart ngang
/admin/companies              → Company / Role / Permission management
```

---

## Phases

### Phase 1 — Foundation
**Trạng thái:** ✅ Hoàn tất (2026-05-24)

Mục tiêu: nền tảng layout + tracking session để các phase sau dùng được.

- [x] Tạo `LoginHistory` model + Alembic migration `0030_login_history`
- [x] Sửa `SessionService` lưu thêm `login_at`, `last_seen_at`, `ip`, `user_agent` vào KV store
- [x] Sửa `login.access_token` ghi 1 row `LoginHistory` mỗi lần login (success/fail)
- [x] `validate_access_payload` update `last_seen_at` mỗi request (best-effort)
- [x] Thêm `list_active_sessions()` + `revoke_session_by_id()` cho service
- [x] Refactor `admin.tsx` thành layout (sidebar + Outlet)
- [x] Tạo `AdminSidebar.tsx` (4 mục: Overview / Users / Organization / Companies)
- [x] Redirect `/admin` → `/admin/overview` via `admin.index.tsx`
- [x] Stub route files: `admin.overview.tsx`, `admin.users.tsx`, `admin.organization.tsx`, `admin.companies.tsx`

**Lưu ý chạy:**
- Chạy `alembic upgrade head` trong backend để apply migration `0030_login_history`
- Khởi động lại backend để load model mới
- Frontend: chạy `vite dev` sẽ tự regenerate `routeTree.gen.ts` cho các route mới

**Files sẽ thay đổi/tạo:**
- `backend/app/models/auth.py` (mới — `LoginHistory`) hoặc gộp vào `models/user.py`
- `backend/app/alembic/versions/xxxx_login_history.py` (mới)
- `backend/app/core/auth/session_service.py` (sửa)
- `backend/app/api/routes/login.py` (sửa `access_token` handler)
- `frontend/src/routes/_layout/admin.tsx` (refactor → layout)
- `frontend/src/routes/_layout/admin.overview.tsx` (mới — stub)
- `frontend/src/routes/_layout/admin.users.tsx` (mới — stub, copy logic cũ tạm)
- `frontend/src/routes/_layout/admin.organization.tsx` (mới — stub)
- `frontend/src/routes/_layout/admin.companies.tsx` (mới — chứa logic cũ)
- `frontend/src/components/Admin/AdminSidebar.tsx` (mới)

---

### Phase 2 — Overview Dashboard
**Trạng thái:** ✅ Hoàn tất (2026-05-24)

Mục tiêu: trang `/admin/overview` với KPI + charts + active sessions.

- [x] Backend `backend/app/api/routes/admin_stats.py`:
  - [x] `GET /api/v1/admin/stats/overview` — KPI
  - [x] `GET /api/v1/admin/stats/sessions/active` — list active sessions
  - [x] `GET /api/v1/admin/stats/logins?days=30` — login frequency
  - [x] `GET /api/v1/admin/stats/users/activity?days=7` — top user activity
  - [x] `DELETE /api/v1/admin/stats/sessions/{session_id}` — revoke
- [x] Router đã đăng ký trong `backend/app/api/main.py`
- [x] Frontend components:
  - [x] `KpiCard.tsx`
  - [x] `LoginFrequencyChart.tsx` (recharts LineChart, 2 series: login_count + unique_users)
  - [x] `TopUsersChart.tsx` (recharts BarChart vertical, top N)
  - [x] `ActiveSessionsTable.tsx` (poll 30s, có nút Revoke)
- [x] Wire vào `admin.overview.tsx`
- [x] Frontend API client viết tay (`frontend/src/modules/admin/adminStatsApi.ts`) — không cần regenerate OpenAPI

**Lưu ý chạy:**
- Backend cần restart để load router `admin_stats`
- Login lần đầu sau khi apply migration để có dữ liệu thống kê
- Phải là superuser để truy cập (`get_current_active_superuser` guard)

---

### Phase 3 — User Management
**Trạng thái:** ✅ Hoàn tất (2026-05-24)

Mục tiêu: list user + trang detail với tabs để fix UX edit (department + role gộp 1 chỗ).

- [x] Backend `backend/app/api/routes/admin_users.py`:
  - [x] `GET /api/v1/admin/users` — list user giàu (company, dept, primary role, last_login)
  - [x] `GET /api/v1/admin/users/{user_id}/detail` — gom info + memberships + sessions + activity
  - [x] `POST /api/v1/admin/users/{user_id}/memberships` — tạo gộp company+role+department (atomic transaction, demote primary cũ)
  - [x] `PATCH /api/v1/admin/users/{user_id}/memberships/{company_id}` — update gộp role + department + is_primary
  - [x] `DELETE /api/v1/admin/users/{user_id}/memberships/{company_id}` — xoá toàn bộ role trong công ty, dọn department nếu thuộc cty đó
  - Activity timeline đã bao gồm trong `/detail` (recent_activity 30 record gần nhất)
- [x] Router đăng ký trong `app/api/main.py`
- [x] Frontend `frontend/src/modules/admin/adminUsersApi.ts` — axios client
- [x] `admin.users.tsx` — wire `UserListTable` với React Query
- [x] `Users/UserListTable.tsx` — bảng + filter bar (search + company + dept + role + status), row click → detail
- [x] `admin.users.$userId.tsx` — trang detail với header + Tabs
- [x] `Users/InfoTab.tsx` (email, name, password reset, active, superuser — dùng `UsersService.updateUser`)
- [x] `Users/MembershipTab.tsx` — bảng + nút thêm/sửa/xoá
- [x] `Users/MembershipDialog.tsx` — dialog gộp Company + Role + Department + is_primary (1 API call atomic)
- [x] `Users/ActivityTab.tsx` — active sessions + lịch sử login

**Permissions tab:** chưa làm — backend chưa có endpoint xem effective permissions theo user_id (chỉ có `my-permissions`). Đẩy sang Phase 6 nếu cần.

**Lưu ý chạy:**
- Restart backend
- Truy cập `/admin/users` để xem list mới, click row → vào trang detail có tabs
- Test tab Membership: thêm/sửa role + department trong 1 dialog, save 1 lần

---

### Phase 4 — Organization Chart
**Trạng thái:** ✅ Hoàn tất (2026-05-25)

- [x] Thêm `react-organizational-chart` (^2.2.1) vào `package.json`
- [x] `admin.organization.tsx` — select company + render chart
- [x] `OrgChart.tsx` — render `Tree` từ `/roles/org-tree` (Company → Department → Role → Member)
- [x] `OrgNode.tsx` — 4 kiểu node (company/department/role/member), member link sang `/admin/users/:id`
- Toolbar gộp vào page (không tách file riêng — chỉ có select company)
- [ ] Export PNG — bỏ qua (đẩy sang Phase 6 nếu cần)

**Lưu ý chạy:**
- Frontend: `npm install` (hoặc `bun install`) để cài `react-organizational-chart`
- Truy cập `/admin/organization`, chọn công ty, click vào card thành viên để jump sang trang detail

---

### Phase 5 — Companies refactor
**Trạng thái:** ✅ Hoàn tất (2026-05-25)

- [x] Refactor `admin.companies.tsx` thành split-pane: list công ty bên trái + Tabs bên phải
- [x] Tách thành sub-components nhỏ trong `components/Admin/Companies/`:
  - [x] `CompaniesList.tsx` — danh sách công ty dạng card chọn
  - [x] `CompanyInfoTab.tsx` — sửa tên công ty
  - [x] `CompanyRolesTab.tsx` — bảng vai trò + form thêm + sửa quyền (dùng `RolePermissionsDialog`)
  - [x] `CompanyDepartmentsTab.tsx` — wrap `DepartmentManagement` cũ trong card
  - [x] `CompanyMembersTab.tsx` — bảng thành viên, đổi role + phòng ban + đặt primary + gỡ
  - [x] `RolePermissionsDialog.tsx` — tách dialog phân quyền ra riêng
- [x] Dọn dẹp `admin.tsx` cũ → đã refactor sang layout từ Phase 1
- File cũ `CompanyManagement.tsx` (605 dòng) còn lại vì `/company` route ngoài scope admin vẫn dùng — không xoá để tránh phá feature khác

**Lưu ý chạy:**
- Truy cập `/admin/companies` → list bên trái, click chọn → tabs Info / Roles / Departments / Members

---

### Phase 6 — Polish
**Trạng thái:** ✅ Hoàn tất (2026-05-25)

- [x] **Permissions tab** — backend endpoint `GET /admin/users/{id}/permissions` (group by module, có source: superuser/director/manager/assigned/none) + component `PermissionsTab.tsx` wire vào trang detail
- [x] **Activity timeline grouping** — group theo ngày, layout 2 cột (sessions trái + lịch sử phải), vertical timeline với connector
- [x] **Export org chart PNG** — thêm `html-to-image` dep, nút "Xuất PNG" trong toolbar, dynamic import (~50KB lazy)
- [x] **Loading skeletons** cho trang user list
- [x] **Empty states** — đã có sẵn ở các Phase trước

**Bỏ qua:**
- Filter advanced (date range) — filter hiện tại đủ dùng

**Lưu ý chạy:**
- Frontend: `npm install` để cài `html-to-image`
- Backend restart để load endpoint `/admin/users/{id}/permissions`

---

## Changelog

- 2026-05-24: Plan tạo, bắt đầu Phase 1.
- 2026-05-24: Phase 1 hoàn tất — backend session tracking + frontend admin layout với sidebar và 4 route con.
- 2026-05-24: Phase 2 hoàn tất — 5 endpoints `/admin/stats/*`, 4 components dashboard, trang overview với KPI/charts/active sessions (poll 30s).
- 2026-05-24: Phase 3 hoàn tất — 5 endpoints `/admin/users/*` (atomic memberships), trang `/admin/users` với filter bar, trang `/admin/users/:id` 3 tabs. Fix UX edit dept+role gộp 1 dialog.
- 2026-05-25: Phase 4 hoàn tất — org chart ngang dùng `react-organizational-chart`, trang `/admin/organization` chọn công ty và xem cây Company→Department→Role→Member, click member jump sang trang detail.
- 2026-05-25: Phase 5 hoàn tất — refactor `/admin/companies` thành split-pane (list + Tabs), tách 6 sub-components trong `Companies/`. Giữ file `CompanyManagement.tsx` cũ vì `/company` route vẫn dùng.
- 2026-05-25: Phase 6 hoàn tất — Permissions tab (backend + frontend), activity timeline group theo ngày, export org chart PNG, skeleton loading. **Toàn bộ redesign admin hoàn tất.**
- 2026-05-25: Hậu Phase 6 — 4 cải tiến theo feedback: (1) cho director (role level 1) truy cập `/admin/organization`, sidebar ẩn item superuser-only; (2) bảng "Phiên đang hoạt động" có max-height 28rem + sticky header; (3) tên user trong sessions click jump sang detail; (4) trang mới `/admin/activity` xem audit log toàn hệ thống + endpoint `GET /admin/stats/audit`.
- 2026-05-25: Hậu Phase 6 (2) — (1) thêm "Hồ sơ của tôi" trong user dropdown link sang `/admin/users/:meId`; (2) AdminSidebar responsive: ẩn trên mobile (`hidden md:block`), thêm `embedded` prop để render trong drawer; (3) AdminLayout có mobile top bar với hamburger mở `Sheet` chứa sidebar.

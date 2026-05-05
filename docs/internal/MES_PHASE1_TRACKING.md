# MES - Phase 1 Tracking (Account -> Role/Permission -> Project -> Task)

## Mục tiêu Phase 1 (tập trung MES)
Xây dựng luồng “từ account có quyền -> tạo Project -> chia cây Task -> theo dõi tiến độ -> bằng chứng hoàn thành -> dashboard báo cáo” theo biên bản họp.

## Tình trạng hiện tại trong backend (để làm nền)
### Auth & Account
- `POST /api/v1/login/access-token`
- `POST /api/v1/login/test-token`
- `POST /api/v1/password-recovery/{email}`
- `POST /api/v1/reset-password/`
- `POST /api/v1/password-recovery-html-content/{email}` (chỉ superuser)

### Users (admin)
- `GET /api/v1/users/`
- `POST /api/v1/users/`
- `PATCH /api/v1/users/me`
- `PATCH /api/v1/users/me/password`
- `GET /api/v1/users/me`
- `DELETE /api/v1/users/me`
- `POST /api/v1/users/signup`
- `GET /api/v1/users/{user_id}` (superuser kiểm soát)
- `PATCH /api/v1/users/{user_id}` (superuser)
- `DELETE /api/v1/users/{user_id}` (superuser)

### MES Core APIs (đã có)
#### Projects
- `GET /api/v1/projects/?status={status}`
- `POST /api/v1/projects/`
- `GET /api/v1/projects/{project_id}`
- `PATCH /api/v1/projects/{project_id}`
- `POST /api/v1/projects/{project_id}/level-config` (cấu hình hierarchy theo level)
- `GET /api/v1/projects/{project_id}/level-config`
- `GET /api/v1/projects/{project_id}/members`
- `POST /api/v1/projects/{project_id}/members` (add/update member theo role_id)

#### Tasks
- `POST /api/v1/projects/{project_id}/tasks` (task gốc - level 0)
- `POST /api/v1/tasks/{parent_id}/children` (task con)
- `GET /api/v1/tasks/{task_id}`
- `GET /api/v1/projects/{project_id}/tasks?parent_id=&assignee_id=&skip=&limit=`
- `GET /api/v1/tasks/my/dashboard` (today / due_soon / overdue)
- `PATCH /api/v1/tasks/{task_id}` (update, có validate timeline nếu đổi start/end)
- `PATCH /api/v1/tasks/{task_id}/status` (todo/in_progress/review/done; workers chỉ update task của mình)
- `DELETE /api/v1/tasks/{task_id}` (soft delete)
- `POST /api/v1/tasks/{task_id}/clone` (clone subtree)
- `POST /api/v1/tasks/{task_id}/comments`
- `GET /api/v1/tasks/{task_id}/comments`
- `POST /api/v1/tasks/{task_id}/proofs` (upload bằng chứng)
- `PATCH /api/v1/tasks/{task_id}/proofs/{proof_id}` (review approve/reject + review_note)
- `GET /api/v1/tasks/{task_id}/proofs`
- `POST /api/v1/tasks/{task_id}/dependencies` (finish-to-start dependency)
- `GET /api/v1/tasks/{task_id}/audit` (audit trail theo task)
- `GET /api/v1/tasks/{task_id}/conflicts` (kiểm tra hard/soft timeline conflicts)

#### Dashboard / Reports (KPI & thống kê MES)
- `GET /api/v1/dashboard/overview`
- `GET /api/v1/dashboard/projects/stats`
- `GET /api/v1/dashboard/users/workload` (bàn cờ nhân sự - count task active)
- `GET /api/v1/dashboard/leaderboard` (leaderboard completion rate)
- `GET /api/v1/dashboard/overdue` (overdue local vs critical)
- `GET /api/v1/dashboard/tasks/calendar` (heatmap dữ liệu theo ngày)

## RBAC hiện tại (đã có seeding sẵn)
File seed mặc định: `backend/app/scripts/seed_defaults.py`
- Roles hệ thống: `admin`, `director`, `manager`, `leader`, `worker`, `observer`
- Permission codes dạng `MODULE_ACTION[_SCOPE]` (đã seed cho Project/Task/Comment/Proof/Report/Audit/User management)
- Project member roles: gán `role_id` vào `ProjectMemberRole` qua API:
  - `POST /api/v1/projects/{project_id}/members`

## Các khoảng trống cần bổ sung để đúng biên bản họp (Phase 1)
- Endpoint quản lý “organization/department”, CRUD “role/permission”, và UI gán global role cho user: hiện mới có models + seed, chưa có API routes.
- Logic “request giải trình khi trễ hạn” theo workflow nhiều bước (biên bản nêu rõ luồng xin phép): hiện mới có overdue report + comment_type phục vụ justification, và review proofs; cần mở rộng workflow.
- Checklist/đính kèm/link ngoài proof/comment: Phase 1 có thể MVP bằng proofs/comment, nhưng nếu cần checklist riêng thì phải thêm model + API.
- Recurrence (lặp lại task): chưa thấy API trong tasks routes.

## Timeline kế hoạch Phase 1 (gợi ý theo tuần)
Mốc ETA có thể chỉnh theo tốc độ đội. Mục tiêu là ra được luồng end-to-end MES core trong 4-6 tuần.

### Bảng tracking theo step
| Step | Nhóm tính năng | Deliverable | Backend (API/DB) | Frontend | Owner | ETA | Done criteria |
|---|---|---|---|---|---|---|---|
| 0 | Setup & chuẩn hoá | Xác định scope MES Phase 1 + mapping permission | Review permission codes liên quan TASK/PROJECT/PROOF/REPORT | Setup screens nền MES | Tech Lead | W0 | Có danh sách màn + API contract chốt |
| 1 | Account (Auth) | Luồng login/signup/reset hoạt động ổn định + phân quyền vào UI | Không thay đổi lớn (tận dụng existing auth) | Login/signup + persist token | Frontend | W1 | Người dùng đăng nhập và vào đúng màn MES |
| 2 | Role/Permission (RBAC) | CRUD/seed hiển thị role & permission + gán global role cho user | Tạo API: list role/permission + assign user global role + assign/override project member role (nếu cần) | Admin UI quản role/permission + gán user | Backend + FE | W2 | Có thể tạo người “worker/leader/manager” và giới hạn quyền đúng |
| 3 | Project - Setup hierarchy | Tạo Project + cấu hình Task Level Config theo hierarchy (requires_proof/can_have_children/max_children/assignable roles) | `POST/GET /projects/{id}/level-config` đã có; bổ sung validation & audit theo project nếu cần | UI tạo project + màn cấu hình level | Backend + FE | W2-W3 | Tạo được cây hierarchy đúng theo rule công ty |
| 4 | Project - Members | Quản lý thành viên dự án (PM/Manager/Leader/Worker) | Tận dụng `POST /projects/{id}/members` + thêm endpoint remove nếu cần | UI add member chọn role_id | FE | W3 | Người dùng vào project thấy đúng dataset |
| 5 | Task - CRUD + Tree | Tạo task gốc & task con + list theo dự án + phân công assignee | `POST /projects/{id}/tasks`, `POST /tasks/{parent}/children`, `GET list` đã có | UI tạo task theo cây (tree view) | FE + Backend | W3-W4 | Tạo được cây task nhiều level, không bị lỗi timeline |
| 6 | Task - Workflow | Update timeline + update status todo/in_progress/review/done + clone subtree | `PATCH /tasks/{id}`, `PATCH /tasks/{id}/status`, `POST /tasks/{id}/clone` đã có | UI change status + UI clone | Backend + FE | W4 | Flow chuyển trạng thái hoạt động, worker chỉ update task của mình |
| 7 | Task - Proofs & Approvals (MVP) | Upload bằng chứng + review approve/reject + lưu audit trail | `POST /tasks/{id}/proofs`, `PATCH /proofs/{proof_id}`, `GET /tasks/{id}/audit` đã có | UI upload + màn review (leader/manager) | Backend + FE | W4-W5 | Có thể hoàn thành task bằng proofs và review đúng quyền |
| 8 | Dashboard & Reports | Overview, workload nhân sự (xanh/đỏ/vàng logic), leaderboard, overdue & calendar | `GET /dashboard/*` đã có; bổ sung filter theo department/project nếu cần | UI dashboard card + bảng | FE | W5 | Dashboard đúng số liệu với dữ liệu test |
| 9 | “Trễ hạn - giải trình” (MVP phần workflow) | Nếu task overdue: yêu cầu comment_type=delay_justification hoặc note khi status | Mở rộng: ràng buộc khi chuyển sang `review/done` hoặc khi overdue -> bắt buộc lý do | UI nhập lý do khi trễ + gửi request cho role cấp trên | Backend + FE | W5-W6 | Quy định trễ hạn được enforce ở backend |

## Danh sách API contract cho Phase 1 (các endpoint MES core cần UI dùng)
- Projects: `GET/POST/PATCH /projects/`, `GET/POST /projects/{id}/level-config`, `GET/POST /projects/{id}/members`
- Tasks: `POST /projects/{id}/tasks`, `POST /tasks/{parent}/children`, `GET /tasks/{task}`, `GET /projects/{id}/tasks`, `PATCH /tasks/{task}/status`, `POST /tasks/{task}/clone`
- Proofs: `POST /tasks/{task}/proofs`, `PATCH /tasks/{task}/proofs/{proof}`
- Comments (delay justification): `POST/GET /tasks/{task}/comments`
- Dashboard: `GET /dashboard/overview`, `/projects/stats`, `/users/workload`, `/leaderboard`, `/overdue`, `/tasks/calendar`

## Mở câu hỏi để chốt scope (trước khi chốt W0)
1. “Request xin phép sếp” khi trễ hạn cần lưu trạng thái riêng (pending/approved/rejected) hay dùng trực tiếp approval của proofs/comment đủ cho Phase 1?
2. Recurrence (lặp lại công việc) có phải yêu cầu bắt buộc Phase 1 hay để Phase 2?
3. Checklist là bắt buộc sớm hay có thể dùng proofs/comment như MVP?
4. “Chat theo dự án” Phase 1 có cần không, hay bỏ qua cho focus MES end-to-end?


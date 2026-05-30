# Plan Fix Task Flow (5 tầng + Templates)

Ngày tạo: 2026-05-29
Cập nhật: 2026-05-29
Scope: Fix bugs/edge cases trong luồng task BE/FE đã verify.

## Trạng thái

| ID | Mô tả ngắn | File chính | Severity | Status |
|----|------------|-----------|----------|--------|
| B1 | Parent "done" khi children chưa xong (rollup weight=0 bypass) | backend/app/services/task_service.py | HIGH | ✅ DONE |
| B2 | Soft-delete parent không cascade xuống children → orphan | backend/app/services/task_service.py | HIGH | ✅ DONE |
| B4 | `apply_profile` thiếu permission + thiếu validate_timeline + thiếu audit/notify | backend/app/api/routes/task_profiles.py | HIGH | ✅ DONE (permission + clamp timeline; audit/notify chưa) |
| B9 | FE gửi sentinel `"__ROOT__"` thành UUID → 422 | frontend/src/components/TaskProfile/EditProfileDialog.tsx | HIGH | ✅ DONE |
| B3 | Create child khi parent.status="done" không bị chặn | backend/app/api/routes/tasks.py | MEDIUM | ✅ DONE |
| B5 | `apply_profile` orphan item khi parent_item_id missing | backend/app/api/routes/task_profiles.py | MEDIUM | ✅ DONE |
| B6 | `apply_profile` child timeline > parent timeline | backend/app/api/routes/task_profiles.py | MEDIUM | ✅ DONE |
| B7 | apply_profile chưa cross-validate level vs parent_item_id | backend/app/api/routes/task_profiles.py | LOW | ✅ DONE |
| B10 | EditProfileDialog không refetch profile detail sau mutation | frontend/src/components/TaskProfile/EditProfileDialog.tsx | MEDIUM | ✅ DONE (thêm invalidate detail query) |
| B13 | apply_profile không recalc CPM | backend/app/api/routes/task_profiles.py | LOW | ✅ DONE |
| B16 | apply_profile sort order_index chung level | backend/app/api/routes/task_profiles.py | LOW | ✅ DONE (sort thêm theo id, vẫn ở cùng level) |
| B12 | `update_task_status` không lock → double-click done | backend/app/services/task_service.py | MEDIUM | ✅ DONE (SELECT FOR UPDATE) |
| B14 | `update_task` không validate children khi rút ngắn parent end_time | backend/app/services/task_service.py | MEDIUM | ✅ DONE |
| B8 | `duration_days` cắt phần lẻ ngày | backend/app/api/routes/task_profiles.py | LOW | TODO |
| B11 | response_model `list[dict]` | backend/app/api/routes/task_profiles.py | LOW | SKIP (cosmetic, không gây bug) |
| B15 | FE TaskProfile schema thiếu company_id/updated_at | frontend/src/modules/taskProfile/taskProfileApi.ts | LOW | TODO |
| B4b | apply_profile chưa audit/notify assignee | backend/app/api/routes/task_profiles.py | MEDIUM | TODO (tách từ B4) |

## Đã làm (Đợt 1 + một phần Đợt 2)

### B1 — Chặn parent done khi còn child chưa done
- File: `backend/app/services/task_service.py` (update_task_status)
- Thêm check trực tiếp children `status != "done"` trước khi rollup gate. Trả 422 với tên 3 task con đầu tiên + đếm dư.

### B2 — Cascade soft-delete
- File: `backend/app/services/task_service.py` (delete_task)
- BFS toàn subtree, soft-delete + xóa deps + ghi audit từng node. Bỏ qua node đã deleted (idempotent).

### B3 — Chặn create child khi parent.status="done"
- File: `backend/app/api/routes/tasks.py` (create_child_task)
- Trả 422 nếu `parent.status == "done"`.

### B4 / B5 / B6 / B7 / B13 / B16 — apply_profile hardening
- File: `backend/app/api/routes/task_profiles.py`
- Thêm `Depends(require_permission("TASK_CREATE"))`.
- Validate: profile rỗng, item.level khớp parent_item.level + 1, root item phải level=0, không tồn tại cha → 422.
- Validate parent_task: tồn tại, chưa xóa, chưa "done", không vượt 5 tầng.
- Tạo cây theo level: child end_time clamp ≤ parent end_time; min duration 1s; start_time của child = parent_task.start_time (khi attach) hoặc now.
- Sau khi tạo xong: gọi `TaskService.recalculate_critical_path` (silent fallback).
- TODO còn: ghi audit `task.created` + notify assignee cho từng task tạo ra (B4b).

### B9 — Sentinel "__ROOT__" → null
- File: `frontend/src/components/TaskProfile/EditProfileDialog.tsx`
- Khi mutate: `parent_item_id: addingUnder === "__ROOT__" ? null : addingUnder`.

### B10 — Invalidate detail query
- File: `frontend/src/components/TaskProfile/EditProfileDialog.tsx`
- `invalidate()` giờ invalidate cả `["task-profiles"]` lẫn `["task-profile", profile.id]`.

## Còn lại (priority)
1. **B4b** (medium): audit + notify cho apply_profile.
2. **B8 / B15** (low): polish.

### F1 — Multi-assignee khi tạo Hạng mục
- BE: `TaskCreate.extra_assignee_ids: list[UUID] = []`; `ApplyProfileRequest.extra_assignee_ids: list[UUID] = []`.
- BE: `create_task` insert TaskAssignee rows cho từng extra (dedup, skip primary), notify + WS `task.assigned` cho từng extra (trừ actor).
- BE: `apply_profile` insert TaskAssignee cho mọi task tạo ra trong tree.
- FE: `TaskCreate` type + `applyProfile` body có `extra_assignee_ids?: string[]`.
- FE: Dialog "Tạo Hạng mục" thêm picker multi-select (chips + autocomplete), reset khi mở dialog, lọc trùng primary.

### B12 — Lock row khi set status
- File: `repositories/task_repository.py` + `services/task_service.py:update_task_status`
- Thêm `TaskRepository.lock_for_update` (SELECT … FOR UPDATE). update_task_status đổi từ `get_or_404` → `lock_for_update`.
- Postgres: serialize concurrent writers; SQLite: no-op (an toàn vì dev).

### B14 — Validate children khi update parent timeline
- File: `services/task_service.py:update_task`
- Sau khi validate parent, lặp qua direct children: chặn nếu `child.start_time < new_start` hoặc `child.end_time > new_end`.

## Notes
- Không chạy test suite vì không có instruction; chỉ syntax-check Python OK.
- FE chưa build verify; đề nghị `pnpm tsc` / `pnpm build` ở frontend trước khi merge.

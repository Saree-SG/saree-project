# Saree ERP — POC Implementation Plan (Chi tiết từng Step)

Mỗi step là **1 tính năng = 1 cặp BE + FE**, code xong step nào test step đó rồi mới qua step kế.

---

## Step 0: Demo Data Setup

### Mục đích
Chuẩn bị sẵn accounts + dữ liệu mẫu để demo script chạy mượt, không phải setup live trước khách.

### Cần tạo

**Accounts (3 role levels):**
| Account | Email | Role | Ghi chú |
|---|---|---|---|
| Giám đốc | gd@saree.demo | director (level 1) | Duyệt proof, gia hạn, xem dashboard |
| Tổ trưởng Lắp đặt | tt@saree.demo | manager (level 2) | Phân việc, xin gia hạn |
| Thợ Điện | tho1@saree.demo | worker (level 3) | Nhận việc, báo cáo tiến độ |
| Thợ Hàn | tho2@saree.demo | worker (level 3) | Nhận việc, upload proof |

**Company / Department:**
- Company: "SAREE Demo"
- Departments: "Tổ Lắp Đặt", "Tổ Điện", "Tổ Hàn"

**Project mẫu:** "Lắp đặt hệ thống kho lạnh - Khách hàng ABC"
- Status: `active`
- Members: cả 4 accounts trên
- Tasks mẫu:
  - `[Lắp đặt hệ thống]` — assignee: Tổ trưởng, status: `in_progress`
    - `[Lắp đường ống lạnh]` — assignee: Thợ Hàn, status: `in_progress`, deadline = hôm qua (để test overdue)
    - `[Lắp hệ thống điện]` — assignee: Thợ Điện, status: `todo`
    - `[Kiểm tra nghiệm thu]` — assignee: Tổ trưởng, status: `todo`, start sau task trên

**Script seed:** Dùng `backend/app/scripts/seed_defaults.py` hoặc tạo file `seed_demo.py` riêng.

### Test Step 0
```
1. Chạy seed script → verify 4 accounts login được
2. Verify project + task tree hiển thị đúng cấu trúc
3. Verify task "Lắp đường ống" hiện trạng thái overdue (deadline hôm qua)
```

---

## Step 1: Delay Request & Approval Flow

### BE — Cần gì?

**Đã có đầy đủ, KHÔNG cần code thêm:**
- `POST /tasks/{id}/comments` — tạo comment với `comment_type: "delay_justification"`, `requested_end_time`, `approval_status: "PENDING"`
- `PATCH /tasks/{id}/comments/{id}/approval` — duyệt/từ chối, body `{ approval_status: "APPROVED" | "REJECTED" }`
- `GET /tasks/{id}/comments` — list comments (bao gồm delay requests)
- Model [TaskComment](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/models/task.py#L200-L213) đã có `requested_end_time`, `approval_status`
- Service [approve_delay](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/services/task_service.py) tự cập nhật `task.end_time` khi APPROVED

### FE — Cần làm gì?

**File:** [tasks.$taskId.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/tasks.$taskId.tsx)

1. **Thêm section "Yêu cầu gia hạn"** (sau status buttons, trước description):
   - Lọc `commentsQuery.data` lấy items có `comment_type === "delay_justification"`
   - Hiển thị mỗi delay request: lý do, ngày yêu cầu, badge trạng thái (PENDING vàng / APPROVED xanh / REJECTED đỏ)
   - Nút **"Xin gia hạn"** → mở `Dialog`:
     - Input `content` (lý do), DatePicker `requested_end_time`
     - Submit mutation gọi `TasksService.addComment()` với `comment_type: "delay_justification"`, `approval_status: "PENDING"`
   - Với mỗi request PENDING + user hiện tại khác assignee → hiện nút **"Duyệt"** / **"Từ chối"**
     - Gọi `TasksService.approveDelayRequest()` (generated client đã có)

2. **Tách Discussion section**: phân biệt comments `general` vs `delay_justification` để không lẫn

3. **Thêm section "Bằng chứng hoàn thành" với Review UI** (proof approval — cần cho demo script):
   - Query `GET /tasks/{id}/proofs` → list proofs
   - Với mỗi proof có `review_status === "pending"` + user là assignor/manager:
     - Hiện nút **"Duyệt"** / **"Từ chối"** + input lý do từ chối
     - Gọi `TasksService.reviewTaskProof({ taskId, proofId, requestBody: { review_status, review_note } })`
   - Badge trạng thái proof: `pending` (xám) / `approved` (xanh) / `rejected` (đỏ + lý do)

> [!NOTE]
> Backend có đủ `PATCH /tasks/{id}/proofs/{proof_id}`. Proof review UI này cần cho demo step "Tổ trưởng duyệt proof của thợ".

### Test Step 1

```
1. Login account Thợ → vào task detail → bấm "Xin gia hạn" → nhập lý do + ngày mới → Submit
2. Verify comment mới xuất hiện với badge "PENDING" vàng
3. Login account Giám đốc → vào cùng task → thấy delay request pending
4. Bấm "Duyệt" → verify badge chuyển "APPROVED" xanh
5. Verify deadline task tự cập nhật thành ngày mới
6. Lặp lại bước 1-3, lần này bấm "Từ chối" → verify badge "REJECTED" đỏ, deadline không đổi
--- Proof Review ---
7. Thợ upload proof (Evidence section) → verify proof hiện với badge "Chờ duyệt"
8. Login Tổ trưởng → vào task → thấy proof section + nút "Duyệt" / "Từ chối"
9. Bấm "Từ chối" + nhập lý do → verify badge "Bị từ chối" + hiện lý do
10. Thợ re-upload proof → Tổ trưởng "Duyệt" → verify badge "Đã duyệt" xanh
```

> [!WARNING]
> **Bug cần fix trong Step 1B**: Implementation hiện tại cho phép mọi user đều thấy nút Duyệt/Từ chối — cần gate theo permission. Xem Step 1B bên dưới.

---

## Step 1B: Permission Gate + Timeline Cascade + Real-time WebSocket

> **Lý do tách thành bước riêng**: Đây là 3 vấn đề BE + FE phức tạp, không nên gộp với Step 1 (FE-only). Làm sau khi Step 1 đã test ổn.

---

### 1B-1: Permission-based UI Gate (FE only, ~2h)

**Vấn đề hiện tại:**
- Nút "Duyệt" / "Từ chối" delay request đang hiện cho **tất cả** users
- Nút "Duyệt bằng chứng" cũng vậy
- Backend đã chặn đúng (route dùng `TASK_UPDATE` / `PROOF_APPROVE`), nhưng UX xấu — thợ bấm Duyệt rồi bị lỗi 403

**Quy tắc nghiệp vụ:**
| Action | Điều kiện hiển thị |
|---|---|
| **"Xin gia hạn"** | Chỉ `task.assignee_id === currentUser.id` (người được giao việc) |
| **"Duyệt" / "Từ chối" delay** | User có permission `TASK_UPDATE` (level 1: Giám đốc, level 2: Tổ trưởng) |
| **"Duyệt bằng chứng"** | User có permission `PROOF_APPROVE` (level 1-2) |
| **"Từ chối bằng chứng"** | User có permission `PROOF_APPROVE` (level 1-2) |

**File:** [tasks.$taskId.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/tasks.$taskId.tsx)

```ts
// Thêm query lấy permissions của current user (đã có endpoint sẵn)
import { RolesService } from "@/client"

const myPermissionsQuery = useQuery({
  queryKey: ["my-permissions"],
  staleTime: 5 * 60 * 1000,  // cache 5 phút
  queryFn: () => RolesService.readMyPermissions(),
})

const canApproveDelay = (myPermissionsQuery.data ?? []).includes("TASK_UPDATE")
const canApproveProof  = (myPermissionsQuery.data ?? []).includes("PROOF_APPROVE")
const isAssignee = task?.assignee_id === currentUser?.id  // cần query currentUser từ useAuth/session
```

- Nút "Xin gia hạn": chỉ render khi `isAssignee && task.status !== "done"`
- Nút "Duyệt"/"Từ chối" delay: chỉ render khi `canApproveDelay`
- Nút "Duyệt"/"Từ chối" proof: chỉ render khi `canApproveProof`

> [!NOTE]
> Cần xem cách lấy `currentUser` trong file — kiểm tra `useAuth()` hook hoặc `UsersService.readUserMe()` query đã có trong codebase.

**Test 1B-1:**
```
1. Login Thợ (worker, level 3) → task detail
   → Thấy nút "Xin gia hạn" (vì là assignee)
   → KHÔNG thấy nút Duyệt/Từ chối delay
   → KHÔNG thấy nút Duyệt/Từ chối proof

2. Login Tổ trưởng (workshop_lead, level 2) → cùng task
   → KHÔNG thấy "Xin gia hạn" (không phải assignee)
   → CÓ thấy nút Duyệt/Từ chối delay
   → CÓ thấy nút Duyệt/Từ chối proof

3. Login Giám đốc (director, level 1) → cùng task
   → CÓ đủ tất cả nút phù hợp với vai trò
```

---

### 1B-2: Timeline Cascade khi Duyệt Gia Hạn (BE, ~4h)

**Vấn đề đã xác nhận qua code review:**
- `approve_delay()` tại [task_service.py L605-651](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/services/task_service.py) chỉ set `task.end_time = new_end`
- **KHÔNG** tạo `CascadeRequest` → downstream tasks có FS-dependency không bị đẩy deadline
- **KHÔNG** cập nhật parent task `end_time` nếu parent bị vượt quá
- **KHÔNG** cập nhật `project.end_date` nếu project deadline bị vượt quá
- Ngược lại, `update_task()` tại L437-475 **có** tạo CascadeRequest đúng — cần apply logic tương tự vào `approve_delay()`

**Fix: `backend/app/services/task_service.py` → `approve_delay()`**

Sau khi set `task.end_time = new_end` (và trước `session.flush`):

```python
# 1. Tạo CascadeRequest nếu deadline bị đẩy ra
old_end = task.end_time  # lưu trước khi ghi đè
task.end_time = new_end
delay_secs = int((new_end - old_end).total_seconds())
if delay_secs > 0:
    await self._cascade_repo.create_request(
        task_id=task.id,
        delay_seconds=delay_secs,
        actor_id=actor_id,
        policy_stop=True,
    )
    # 2. Propagate lên parent task
    if task.parent_id:
        parent = await self._task_repo.get(task.parent_id)
        if parent and parent.end_time < new_end:
            parent.end_time = new_end
            self._session.add(parent)
            await self._audit_repo.log(
                actor_id=actor_id,
                action="task.deadline_cascaded_to_parent",
                entity_type="task",
                entity_id=parent.id,
                old_value={"end_time": str(old_parent_end)},
                new_value={"end_time": str(new_end)},
            )
    # 3. Propagate lên project end_date
    project = await self._project_repo.get(task.project_id)
    if project and project.end_date < new_end.date():
        old_project_end = project.end_date
        project.end_date = new_end.date()
        self._session.add(project)
        await self._audit_repo.log(
            actor_id=actor_id,
            action="project.deadline_extended_by_task_delay",
            entity_type="project",
            entity_id=project.id,
            old_value={"end_date": str(old_project_end)},
            new_value={"end_date": str(new_end.date())},
        )
```

**Cascade flow hoàn chỉnh sau fix:**
```
approve_delay() approved
    ↓
task.end_time = new_end
    ↓
CascadeRequest created (pending)
    ↓ [Celery worker chạy mỗi 60s]
FS-dependent tasks bị shift start_time + end_time
    ↓
parent.end_time được extend nếu cần
    ↓
project.end_date được extend nếu cần
```

**Business rules bổ sung:**
- Nếu `new_end <= old_end` (user nhập ngày cũ hơn hoặc bằng): không cascade, chỉ cập nhật task
- Nếu `new_end > project.end_date + 30 ngày`: trả về warning 422 "Vượt quá deadline dự án quá xa, cần Giám đốc xác nhận"
- Chỉ có 1 delay request PENDING tại một thời điểm: nếu đã có request PENDING thì chặn tạo mới (trả 409)

**Test 1B-2:**
```
1. Task A (FS→) Task B (FS→) Task C — tất cả trong cùng project
2. Thợ xin gia hạn Task A thêm 5 ngày → Giám đốc duyệt
3. Verify task A.end_time tăng 5 ngày
4. Chờ ~60s (Celery tick) → verify Task B.start_time + end_time tự tăng 5 ngày
5. Verify Task C tương tự
6. Verify project.end_date tăng nếu Task C.end_time > project.end_date
7. Verify parent task của A (nếu có) end_time được extend
8. Check audit log: có entry "task.deadline_cascaded_to_parent" + "project.deadline_extended_by_task_delay"
```

---

### 1B-3: Task-scoped WebSocket cho Real-time Updates (BE + FE, ~6-8h)

**Hiện trạng:**
- WebSocket chỉ có cho Chat (room-scoped) tại `/chat/ws?room_id=`
- Không có mechanism để push real-time khi task thay đổi (delay approved, proof uploaded...)
- Người A duyệt gia hạn → Người B đang mở task detail không thấy gì cho đến khi refresh

**Thiết kế: Task WebSocket endpoint**

**File [NEW]: `backend/app/api/routes/task_ws.py`**

```python
WS /tasks/ws?task_id={uuid}&token={jwt}
```

Auth: giống `chat_ws.py` — Bearer header hoặc `token` query param

Access check (ai được connect?):
- `task.assignee_id == user.id` — người thực hiện
- `task.assignor_id == user.id` — người giao việc
- User là project member có role.level <= 2 (Tổ trưởng, Giám đốc)
- User là `is_superuser`

Fanout: Dùng lại `ConnectionManager` class từ `chat_ws.py`, khởi tạo singleton `task_manager` riêng.

```python
task_manager = ConnectionManager()  # task_id → list[WebSocket]

@router.websocket("/tasks/ws")
async def task_ws_endpoint(
    websocket: WebSocket,
    task_id: uuid.UUID,
    token: str | None = None,
):
    user = await _authenticate_ws(websocket, token)
    task = await get_task(task_id)
    if not _can_access_task(user, task):
        await websocket.close(code=4003)
        return
    await task_manager.connect(str(task_id), websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        task_manager.disconnect(str(task_id), websocket)
```

**Events broadcast (payload format):**
```json
{
  "event": "task.delay_requested",
  "task_id": "uuid",
  "actor_name": "Lê Văn Hàn",
  "data": { "requested_end_time": "2024-12-31T00:00:00", "reason": "..." }
}
```

| Event | Trigger điểm trong service | Payload |
|---|---|---|
| `task.delay_requested` | `add_comment()` khi `delay_justification` | `requested_end_time`, `author_name` |
| `task.delay_approved` | `approve_delay()` khi APPROVED | `new_end_time`, `approver_name` |
| `task.delay_rejected` | `approve_delay()` khi REJECTED | `reviewer_name`, `reason` |
| `task.proof_uploaded` | `upload_proof()` | `uploader_name` |
| `task.proof_approved` | `review_proof()` khi approved | `reviewer_name` |
| `task.proof_rejected` | `review_proof()` khi rejected | `reviewer_name`, `note` |
| `task.status_changed` | `update_task_status()` | `old_status`, `new_status`, `actor_name` |
| `task.deadline_updated` | Sau cascade apply | `old_end`, `new_end` |

**File [MODIFY]: `backend/app/services/task_service.py`**

Inject `task_manager` và gọi broadcast sau mỗi state change:
```python
from app.api.routes.task_ws import task_manager

# Trong approve_delay():
await task_manager.broadcast(str(task.id), json.dumps({
    "event": "task.delay_approved",
    "task_id": str(task.id),
    "data": {"new_end_time": str(new_end), "approver_name": actor.full_name}
}))
```

**File [MODIFY]: `backend/app/api/main.py`**
```python
from app.api.routes.task_ws import router as task_ws_router
app.include_router(task_ws_router, tags=["task-ws"])
```

**FE: Subscribe trong Task Detail Page**

**File [MODIFY]: `tasks.$taskId.tsx`**

```ts
import { getAccessToken } from "@/modules/auth/tokenStore"

// WebSocket connection
useEffect(() => {
  const token = getAccessToken()
  if (!token || !taskId) return

  const wsUrl = `${WS_BASE_URL}/tasks/ws?task_id=${taskId}&token=${token}`
  const ws = new WebSocket(wsUrl)

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    switch (msg.event) {
      case "task.delay_requested":
        queryClient.invalidateQueries({ queryKey: ["task-detail", "comments", taskId] })
        showSuccessToast(`${msg.data.author_name} vừa xin gia hạn deadline`)
        break
      case "task.delay_approved":
        queryClient.invalidateQueries({ queryKey: ["task-detail", "task", taskId] })
        queryClient.invalidateQueries({ queryKey: ["task-detail", "comments", taskId] })
        showSuccessToast(`Deadline đã được duyệt → ${msg.data.new_end_time}`)
        break
      case "task.delay_rejected":
        queryClient.invalidateQueries({ queryKey: ["task-detail", "comments", taskId] })
        showErrorToast("Yêu cầu gia hạn bị từ chối")
        break
      case "task.proof_uploaded":
        queryClient.invalidateQueries({ queryKey: ["task-detail", "proofs", taskId] })
        showSuccessToast(`${msg.data.uploader_name} vừa nộp bằng chứng`)
        break
      case "task.proof_approved":
        queryClient.invalidateQueries({ queryKey: ["task-detail", "proofs", taskId] })
        showSuccessToast("Bằng chứng đã được duyệt ✓")
        break
      case "task.proof_rejected":
        queryClient.invalidateQueries({ queryKey: ["task-detail", "proofs", taskId] })
        showErrorToast(`Bằng chứng bị từ chối: ${msg.data.note}`)
        break
      case "task.status_changed":
        queryClient.invalidateQueries({ queryKey: ["task-detail", "task", taskId] })
        showSuccessToast(`Trạng thái → ${msg.data.new_status}`)
        break
    }
  }

  ws.onerror = () => console.warn("Task WS error")
  return () => ws.close()
}, [taskId, queryClient])
```

Thêm Live indicator trong task header:
```tsx
const [wsConnected, setWsConnected] = useState(false)
// trong ws.onopen: setWsConnected(true)
// trong ws.onclose: setWsConnected(false)

// Trong JSX header:
{wsConnected && (
  <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
    Live
  </span>
)}
```

**Test 1B-3:**
```
1. Tab 1: Login Thợ → mở task detail → thấy "🟢 Live" indicator
2. Tab 2: Login Tổ trưởng → mở cùng task
3. [Tab 1 - Thợ] Xin gia hạn → [Tab 2 - Tổ trưởng] thấy toast "Thợ vừa xin gia hạn" ngay lập tức (không refresh)
4. [Tab 2 - Tổ trưởng] Duyệt gia hạn → [Tab 1 - Thợ] thấy deadline tự update + toast "Deadline được duyệt"
5. [Tab 1 - Thợ] Upload proof → [Tab 2] thấy proof mới xuất hiện ngay
6. Đóng Tab 1 → verify WS disconnect không crash BE
7. Tab 3: Login Giám đốc khác công ty → verify KHÔNG connect được (403)
```

---

### Business Rules Bổ Sung (phát hiện qua review)

Những case chưa có trong hệ thống, cần handle:

1. **Chống duplicate delay request**: Nếu đã có request PENDING, không cho tạo thêm. BE nên kiểm tra trong `add_comment()` trước khi insert, trả 409 nếu vi phạm. FE nên disable nút "Xin gia hạn" khi đã có PENDING request.

2. **Ngày gia hạn phải lớn hơn ngày hiện tại**: BE validate `requested_end_time > now()`, trả 422 nếu vi phạm.

3. **Ngày gia hạn phải lớn hơn deadline hiện tại**: Không có nghĩa xin gia hạn nhưng lại lấy ngày cũ hơn — BE validate `requested_end_time > task.end_time`.

4. **Notify downstream assignees sau cascade**: Khi Celery chạy cascade và shift task B, task C — cần notify assignee của B và C: "Deadline task của bạn vừa bị đẩy do task phụ thuộc bị delay". Implement trong `cascade_job.py` sau mỗi task shift.

5. **Task done không cho xin gia hạn**: Task đã `status = "done"` thì không có nghĩa xin gia hạn — FE đã check `task.status !== "done"` nhưng BE cũng nên validate.

6. **Approval chỉ từ assignor hoặc cấp trên**: Nghiệp vụ: Thợ xin gia hạn → Tổ trưởng duyệt (người giao việc), không phải một Tổ trưởng ngẫu nhiên có `TASK_UPDATE`. Ideally BE nên check: `approver_id == task.assignor_id OR approver.role.level == 1`. Tuy nhiên cho POC, chấp nhận "ai có TASK_UPDATE đều duyệt được" để đơn giản hóa.

---

### Test Step 1B (tổng hợp)

```
--- Permission Gate ---
1. Thợ: thấy "Xin gia hạn" ✓, KHÔNG thấy Duyệt ✗
2. Tổ trưởng: KHÔNG thấy "Xin gia hạn" (không phải assignee), CÓ thấy Duyệt ✓
3. Giám đốc: CÓ tất cả quyền phù hợp với vai trò ✓

--- Cascade ---
4. Duyệt gia hạn task A thêm 5 ngày
5. Sau ~60s: verify task B (FS-dependent) deadline tự tăng 5 ngày
6. Verify project.end_date được extend nếu cần
7. Verify KHÔNG thể tạo 2 delay request PENDING cùng lúc

--- Real-time WS ---
8. 2 browser tabs: Thợ xin gia hạn → Tổ trưởng thấy ngay (không refresh)
9. Tổ trưởng duyệt → Thợ thấy deadline update ngay + toast
10. Live indicator sáng khi connected, tắt khi mất kết nối
```

---

## Step 2: Subtask Tree trong Task Detail

### BE — Cần gì?

**Đã có đầy đủ, KHÔNG cần code thêm:**
- `GET /projects/{id}/tasks?parent_id={taskId}` — list subtasks theo parent ([tasks.py L116-L134](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/api/routes/tasks.py#L116-L134))
- `POST /tasks/{parent_id}/children` — tạo child task ([tasks.py L73-L89](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/api/routes/tasks.py#L73-L89))

### FE — Cần làm gì?

**File:** [tasks.$taskId.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/tasks.$taskId.tsx)

1. **Thêm query subtasks:**
   ```ts
   const subtasksQuery = useQuery({
     enabled: Boolean(task?.project_id),
     queryKey: ["task-detail", "subtasks", taskId],
     queryFn: () => TasksService.listProjectTasks({
       projectId: task!.project_id,
       parentId: taskId, // BE filter by parent_id
       limit: 50,
     }),
   })
   ```

2. **Thêm section "Công việc con"** (sau description):
   - List subtasks: tên, assignee name, status badge (màu), deadline, progress %
   - Click subtask → `<Link to="/tasks/$taskId" params={{ taskId: subtask.id }}>`
   - Nút **"+ Thêm công việc con"** → Dialog:
     - Input: tên, assignee (picker giống project page), start/end date
     - Submit gọi `TasksService.createChildTask({ parentId: taskId, requestBody: {...} })`

3. **Thêm breadcrumb navigation**: nếu task có `parent_id` → hiện link quay về parent task

### Test Step 2

```
1. Vào task gốc (level 0) → verify section "Công việc con" hiện (trống)
2. Bấm "+ Thêm công việc con" → nhập tên + chọn assignee + dates → Submit
3. Verify subtask mới xuất hiện trong list với status "todo"
4. Click subtask → verify navigate tới task detail của subtask
5. Verify subtask detail có breadcrumb/link quay về parent task
6. Ở parent task, verify count subtasks đúng
```

---

## Step 3: Overdue Highlight trên Project Dashboard

### BE — Cần gì?

**Đã có đầy đủ, KHÔNG cần code thêm:**
- `TaskPublic` đã có `computed_status: str | None` (server trả `overdue_local` | `overdue_critical` | `due_soon`)
- `end_time` field luôn có trong response

### FE — Cần làm gì?

**File:** [projects.$projectId.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/projects.$projectId.tsx)

1. **Trong `detailedTasks` render** (line ~511-547):
   - Check: `task.computed_status` chứa `overdue` HOẶC `new Date(task.end_time) < now && task.status !== "done"`
   - Nếu overdue: thêm border đỏ `border-red-400`, badge **"Trễ X ngày"**, text deadline đổi màu đỏ
   - Nếu `due_soon`: border vàng, badge **"Sắp tới hạn"**

2. **Stats card ở trên**: `{stats.overdue_tasks}` hiện số đỏ — thêm click filter → chỉ hiện overdue tasks

3. **Sort**: overdue tasks lên đầu danh sách

### Test Step 3

```
1. Tạo task có deadline = ngày hôm qua → status "todo"
2. Vào project dashboard → verify task hiện border đỏ + badge "Trễ 1 ngày"
3. Tạo task deadline = ngày mai → verify badge "Sắp tới hạn" (vàng)
4. Task đã done: dù quá deadline, KHÔNG hiện overdue
5. Verify overdue task sort lên đầu danh sách
```

---

## Step 4: Audit Log UI trong Task Detail

### BE — Cần gì?

**Đã có đầy đủ, KHÔNG cần code thêm:**
- `GET /tasks/{id}/audit` → `list[AuditLogPublic]` ([tasks.py L363-L370](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/api/routes/tasks.py#L363-L370))
- [AuditLogPublic](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/models/task.py#L372-L381): `actor_id`, `action`, `old_value`, `new_value`, `created_at`

### FE — Cần làm gì?

**File:** [tasks.$taskId.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/tasks.$taskId.tsx)

1. **Thêm query audit:**
   ```ts
   const auditQuery = useQuery({
     queryKey: ["task-detail", "audit", taskId],
     queryFn: () => TasksService.getTaskAudit({ taskId }),
   })
   ```

2. **Thêm section/tab "Lịch sử":**
   - Timeline vertical, mỗi entry:
     - Icon theo action type (status_changed → 🔄, proof_uploaded → 📷, etc.)
     - Text: `"{actor_name} {action_label}" lúc {time}`
     - Nếu có `old_value` → `new_value`: hiện `{old} → {new}`
   - Map action strings → Vietnamese labels (ví dụ: `task.status_changed` → "đã đổi trạng thái")

> [!NOTE]
> `actor_id` là UUID — cần resolve tên. Cách 1: batch query users. Cách 2: thêm `actor_name` vào `AuditLogPublic` ở BE (nhỏ, ~5 dòng trong service). Đề xuất cách 2 cho đơn giản.

### BE — Bổ sung nhỏ (optional but recommended)

**File:** [task_service.py](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/services/task_service.py) — trong `get_audit()`, join user table để trả thêm `actor_name`.

**File:** [task.py (model)](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/models/task.py) — thêm `actor_name: str | None = None` vào `AuditLogPublic`.

### Test Step 4

```
1. Vào task → đổi status todo → in_progress → verify audit log hiện entry mới
2. Upload progress report → verify audit log ghi lại
3. Thêm comment → verify audit log ghi lại
4. Verify mỗi entry hiện tên người thực hiện + thời gian + mô tả action
5. Verify sort mới nhất lên trên
```

---

## Step 5: Project-linked Chat Room

### BE — Cần code

**File:** [project.py (model)](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/models/project.py)
- Thêm field `chat_room_id: uuid.UUID | None = Field(default=None, foreign_key="chatroom.id")` vào `Project`
- Thêm `chat_room_id` vào `ProjectPublic`

**File:** Tạo Alembic migration
```bash
cd backend && alembic revision --autogenerate -m "add_chat_room_id_to_project"
```

**File:** [project_service.py](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/services/project_service.py)
- Trong `create_project()`: sau tạo project → auto tạo `ChatRoom(room_type="group", name=f"Dự án: {project.name}")` → add creator as owner → set `project.chat_room_id = room.id`
- Trong `add_project_member()`: nếu `project.chat_room_id` tồn tại → tự động thêm user đó vào chat room với role `member`. Tương tự `remove_project_member()` → remove khỏi chat room.

**File:** [projects.py (routes)](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/api/routes/projects.py)
- Thêm endpoint `POST /projects/{id}/create-chat-room` (cho project cũ chưa có room)

### FE — Cần làm gì?

**File:** [projects.$projectId.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/projects.$projectId.tsx)
- Thêm nút **"💬 Chat nhóm dự án"** ở header (bên cạnh "Thêm nhân viên")
- Nếu `project.chat_room_id` tồn tại → navigate `/chat?room=${project.chat_room_id}`
- Nếu chưa có → gọi API tạo room trước, rồi navigate

**File:** [chat.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/chat.tsx)
- Đọc URL search param `?room=xxx` → auto select room đó khi mount

### Test Step 5

```
1. Tạo project MỚI → verify BE tự tạo chat room
2. Vào project dashboard → verify nút "Chat nhóm dự án" hiện
3. Click nút → verify navigate tới chat page, auto select đúng room
4. Gửi tin nhắn trong room → verify hoạt động bình thường
5. Project CŨ (chưa có room) → click nút → verify tạo room mới + navigate
6. Thêm member MỚI vào project → verify member đó tự động xuất hiện trong chat room members
7. Xóa member khỏi project → verify member bị remove khỏi chat room
```

---

## Step 6: Direct Message (1-on-1 Chat)

### BE — Cần bổ sung nhỏ (deduplication)

**Đã có:**
- `POST /chat/rooms` với `room_type: "direct"` + `member_user_ids: [userId]` ([chat.py L36-L69](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/api/routes/chat.py#L36-L69))
- `GET /chat/rooms` trả về all rooms bao gồm direct rooms

**Cần thêm — endpoint kiểm tra DM đã tồn tại:**

**File:** [chat.py (routes)](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/api/routes/chat.py)
```python
GET /chat/rooms/direct?user_id={targetUserId}
```
- Tìm room `room_type="direct"` có đúng 2 members: `current_user.id` + `targetUserId`
- Trả về `{ room_id: uuid }` nếu đã có, `{ room_id: null }` nếu chưa có
- FE dùng để tránh tạo duplicate DM room: kiểm tra trước, nếu có thì navigate thẳng, không có mới tạo

### FE — Cần làm gì?

**File:** [chat.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/chat.tsx)

1. **Sidebar phân chia 2 sections:**
   - **"Tin nhắn riêng"**: filter `room.room_type === "direct"` — hiện tên user đối diện thay vì room name
   - **"Nhóm"**: filter `room.room_type === "group"`

2. **Nút "New"** → đổi thành dropdown hoặc 2 nút:
   - **"Nhóm mới"** → logic hiện tại
   - **"Tin nhắn mới"** → Dialog:
     - Input search user by email/name (dùng `getUserByEmail` hoặc query company users)
     - Select user → `createChatRoom({ room_type: "direct", name: null, member_user_ids: [userId] })`

3. **Direct room display**: cho DM rooms, hiện tên + avatar user đối diện (lấy từ `membersQuery`, filter out `currentUser.id`)

4. **Dedup khi tạo DM mới:**
   - Trước khi `createChatRoom()`, gọi `GET /chat/rooms/direct?user_id={targetUserId}`
   - Nếu `room_id` trả về → navigate thẳng tới room đó, không tạo mới
   - Nếu `null` → tạo mới rồi navigate

### Test Step 6

```
1. Vào chat → verify sidebar chia 2 sections "Tin nhắn riêng" + "Nhóm"
2. Click "Tin nhắn mới" → search user → select → verify tạo DM room
3. Verify DM room hiện ở section "Tin nhắn riêng" với tên user đối diện
4. Gửi tin nhắn → verify realtime qua WebSocket
5. Login user kia → verify thấy cùng DM room
6. Lặp lại bước 2 với cùng user → verify KHÔNG tạo room mới, navigate tới room cũ
```

---

## Step 7: Kanban Board cho Project

### BE — Cần gì?

**Đã có đầy đủ, KHÔNG cần code thêm:**
- `GET /projects/{id}/tasks` — list tasks
- `PATCH /tasks/{id}/status` — update status (FE gọi khi drag-drop)

### FE — Cần làm gì?

**File:** [projects.$projectId.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/projects.$projectId.tsx)

1. **Thêm tab switcher** ở trên danh sách tasks: **"📋 Danh sách"** | **"📊 Kanban"**

2. **Kanban view** (inline hoặc tách file riêng):
   - 4 cột: `todo` | `in_progress` | `review` | `done`
   - Mỗi card: tên task, assignee name, deadline (đỏ nếu overdue), priority badge, progress %
   - Drag-and-drop: dùng `@dnd-kit/core` (cần `npm install @dnd-kit/core @dnd-kit/sortable`)
   - Khi drop card sang cột khác → gọi `TasksService.updateTaskStatus()` → invalidate queries

**Dependency mới cần install:**
```bash
cd frontend && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Test Step 7

```
1. Vào project dashboard → verify tab "Kanban" hiện
2. Click tab → verify 4 cột với tasks phân đúng theo status
3. Drag task từ "Chưa làm" → "Đang làm" → verify API call + status update
4. Refresh page → verify task vẫn ở cột mới
5. Verify card hiển thị: tên, assignee, deadline (đỏ nếu trễ), priority
6. Task overdue → verify card có highlight đỏ trong Kanban
```

---

## Step 8: In-app Notifications

### BE — Cần code mới

**File [NEW]:** [notification.py (model)](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/models/notification.py)
```python
class Notification(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    type: str = Field(max_length=50)  # task_assigned | delay_request | proof_rejected | ...
    title: str = Field(max_length=500)
    body: str | None = Field(default=None)
    entity_type: str = Field(max_length=50)  # "task" | "project"
    entity_id: uuid.UUID
    is_read: bool = False
    created_at: datetime = Field(default_factory=_utcnow)
```

**File [NEW]:** `backend/app/api/routes/notifications.py`
- `GET /notifications` — list cho current user, sort by created_at desc, limit 50
- `GET /notifications/unread-count` → `{ count: int }`
- `PATCH /notifications/{id}/read` → mark 1 as read
- `PATCH /notifications/read-all` → mark all as read

**File [NEW]:** Alembic migration cho bảng `notification`

**File [MODIFY]:** [task_service.py](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/services/task_service.py)
- Thêm helper `_notify(user_id, type, title, entity_type, entity_id)` — insert Notification row
- Gọi `_notify` trong:
  - `create_task()` → notify assignee: "Bạn được giao task '{name}'"
  - `add_comment()` khi `delay_justification` → notify assignor: "Yêu cầu gia hạn từ {assignee}"
  - `approve_delay()` → notify comment author: "Yêu cầu gia hạn được duyệt/từ chối"
  - `upload_proof()` → notify assignor: "Thợ {assignee} đã nộp bằng chứng, chờ duyệt"  ← **thiếu trong plan gốc**
  - `review_proof()` khi rejected → notify uploader: "Bằng chứng bị từ chối: {review_note}"
  - `review_proof()` khi approved → notify uploader: "Bằng chứng đã được duyệt" ← **thiếu trong plan gốc**
  - `update_task_status()` khi done → notify assignor: "Task '{name}' hoàn thành"

**File [MODIFY]:** [main.py (routes)](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/backend/app/api/main.py) — register `notifications.router`

### FE — Cần làm gì?

**File [NEW]:** `frontend/src/components/notifications/NotificationBell.tsx`
- Bell icon + badge count (query `GET /notifications/unread-count` polling mỗi 30s)
- Click → dropdown danh sách notifications
- Click notification → navigate tới entity (task/project) + mark as read

**File [NEW]:** `frontend/src/modules/notifications/notificationApi.ts`
- Wrapper functions cho notification APIs

**File [MODIFY]:** [_layout.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout.tsx)
- Thêm `NotificationBell` vào header bar (desktop) và `MobileAppHeader` (mobile)

### Test Step 8

```
1. Login Giám đốc → tạo task giao cho Thợ
2. Login Thợ → verify bell badge = 1, dropdown hiện "Bạn được giao task X"
3. Click notification → verify navigate tới task detail + badge giảm
4. Thợ xin gia hạn → Login Giám đốc → verify bell badge tăng: "Yêu cầu gia hạn từ Thợ"
5. Duyệt gia hạn → Login Thợ → verify notification "Yêu cầu gia hạn được duyệt"
6. Upload proof → Giám đốc reject → Thợ nhận notification "Bằng chứng bị từ chối"
7. Bấm "Đã đọc tất cả" → verify badge = 0
```

---

## Step 9: UI Structure Redesign (Tab System)

### BE — KHÔNG cần thay đổi

### FE — Refactor layout

**File:** [tasks.$taskId.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/tasks.$taskId.tsx)
- Tổ chức lại bằng Tabs (dùng Radix `@radix-ui/react-tabs` — project đã dùng Radix cho Dialog, Select):
  - **"Chi tiết"**: task info + status + assignee + description
  - **"Tiến độ"**: progress reports + evidence/proof
  - **"Thảo luận"**: comments + delay requests
  - **"Công việc con"**: subtask tree (step 2)
  - **"Lịch sử"**: audit log (step 4)

**File:** [projects.$projectId.tsx](file:///Users/macintosh/TA-DOCUMENT/Work/Saree-Project/saree-erp-project/frontend/src/routes/_layout/projects.$projectId.tsx)
- Tabs:
  - **"Tổng quan"**: stats + team cards
  - **"Danh sách"**: task list (current) with overdue highlight
  - **"Kanban"**: kanban board (step 7)

### Test Step 9

```
1. Task detail → verify tất cả tabs navigate đúng, data load đúng
2. Project dashboard → verify 3 tabs hoạt động
3. Mobile: verify tabs responsive, swipeable
4. Verify deep link: reload page → vẫn đúng tab
```

---

## Thứ tự thực hiện đề xuất

| Order | Step | BE work? | Est. | Phụ thuộc |
|---|---|---|---|---|
| 0 | **Step 0**: Demo Data Setup | ⚡ Script seed | 1-2h | — |
| 1 | **Step 1**: Delay Request & Approval + Proof Review UI | ❌ FE only | 4-5h | Step 0 |
| 1B | **Step 1B-1**: Permission Gate UI | ❌ FE only | 2h | Step 1 |
| 1B | **Step 1B-2**: Timeline Cascade Fix | ✅ BE task_service | 4h | Step 1 |
| 1B | **Step 1B-3**: Task WebSocket Real-time | ✅ BE new route + FE | 6-8h | Step 1B-2 |
| 2 | **Step 2**: Subtask Tree | ❌ FE only | 3-4h | Step 1 |
| 3 | **Step 3**: Overdue Highlight | ❌ FE only | 1-2h | — |
| 4 | **Step 4**: Audit Log UI | ⚡ Nhỏ (thêm `actor_name`) | 2-3h | — |
| 5 | **Step 5**: Project Chat + Member Sync | ✅ BE migration + logic | 5-6h | — |
| 6 | **Step 6**: Direct Message + DM dedup endpoint | ⚡ Nhỏ BE + FE | 4-5h | Step 5 |
| 7 | **Step 7**: Kanban Board | ❌ FE only (install dnd-kit) | 5-6h | — |
| 8 | **Step 8**: Notifications | ✅ BE model + API + FE | 6-8h | Step 1B-3 |
| 9 | **Step 9**: UI Redesign (Tabs) | ❌ FE only | 3-4h | All steps done |

**Tổng: ~47-61 giờ ≈ 16-20 ngày (3h/ngày)**

> [!TIP]
> **Recommended parallel track:**
> - Track A (FE-heavy): 0 → 1 → 1B-1 → 2 → 3 → 4 → 7 → 9
> - Track B (BE-heavy): 1B-2 → 1B-3 → 5 → 6 → 8
>
> Step 1B-2 (Cascade fix) là **critical** — demo sẽ không đúng nghiệp vụ nếu thiếu.
> Step 1B-3 (WebSocket) là **wow factor** — demo live update rất ấn tượng với khách hàng.
> Step 9 (Tabs) nên làm cuối cùng.

---

## Demo Script (POC Flow)

Thứ tự demo cho khách hàng để tạo impact tối đa:

```
1. [Giám đốc] Login → Dashboard: KPI tổng quan, overdue count, leaderboard
2. [Giám đốc] Tạo Project "Lắp đặt kho lạnh ABC" → thêm Tổ trưởng + Thợ
             → Verify chat room dự án tự tạo
3. [Giám đốc] Tạo task "Lắp đặt hệ thống" → assign Tổ trưởng
4. [Tổ trưởng] Login → thấy task mới (notification bell) → vào task
             → Tạo 2 subtask: "Lắp đường ống" (Thợ Hàn) + "Lắp điện" (Thợ Điện)
5. [Thợ] Login → thấy task được giao (notification) → Upload ảnh tiến độ 60%
        → Submit proof hoàn thành
6. [Tổ trưởng] Thấy notification "Thợ nộp bằng chứng" → vào task → Duyệt proof ✅
             → Xin gia hạn deadline (lý do: thiếu vật tư)
7. [Giám đốc] Thấy notification "Yêu cầu gia hạn" → Duyệt → deadline tự cập nhật
            → Xem dashboard: tiến độ project cập nhật real-time
8. [Giám đốc] Click "Chat nhóm dự án" → Gửi tin nhắn + đính kèm bản vẽ cho cả team
9. [Giám đốc] Xem tab "Lịch sử" task → thấy đầy đủ timeline: ai làm gì, lúc nào
```

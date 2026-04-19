"""
4-layer project delay prediction engine.

Layers:
  1. Critical Path Impact    → RED    (overdue critical-path task)
  2. Slack/Float Consumption → ORANGE (>90% of float consumed)
  3. Progress Velocity       → YELLOW (time elapsed % >> progress %)
  4. Dependency Bottleneck   → ORANGE (blocking task not done, dependent starts soon)
"""

from __future__ import annotations

import uuid
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from collections.abc import Sequence

from app.models.project import Project
from app.models.task import Task, TaskDependency


def _naive(dt: datetime) -> datetime:
    """Strip timezone info → naive UTC for arithmetic."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _now() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Data class for a single warning
# ---------------------------------------------------------------------------

@dataclass
class DelayWarning:
    severity: str           # "red" | "orange" | "yellow"
    layer: int              # 1..4
    title: str
    detail: str
    task_id: str | None = None
    task_name: str | None = None
    estimated_delay_days: int | None = None


# ---------------------------------------------------------------------------
# Analyzer
# ---------------------------------------------------------------------------

class ProjectDelayAnalyzer:
    """
    Run all 4 delay-prediction checks against a project snapshot.

    Usage::

        analyzer = ProjectDelayAnalyzer(project, tasks, deps, progress_by_task)
        warnings = analyzer.analyze()
    """

    def __init__(
        self,
        project: Project,
        tasks: Sequence[Task],
        deps: Sequence[TaskDependency],
        progress_by_task: dict[uuid.UUID, int],   # task_id → cumulative progress %
    ) -> None:
        self.project = project
        self.all_tasks: list[Task] = list(tasks)
        self.deps: list[TaskDependency] = list(deps)
        self.progress_by_task = progress_by_task
        self.task_by_id: dict[uuid.UUID, Task] = {t.id: t for t in tasks}

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def analyze(self, now: datetime | None = None) -> list[DelayWarning]:
        """Return all warnings sorted RED → ORANGE → YELLOW."""
        if now is None:
            now = _now()

        lf = self._compute_latest_finish()

        warnings: list[DelayWarning] = []
        warnings.extend(self._check_critical_path(now))
        warnings.extend(self._check_slack_consumption(now, lf))
        warnings.extend(self._check_velocity(now))
        warnings.extend(self._check_bottlenecks(now))

        order = {"red": 0, "orange": 1, "yellow": 2}
        warnings.sort(key=lambda w: order.get(w.severity, 9))
        return warnings

    # ------------------------------------------------------------------
    # CPM backward pass — compute Latest Finish per task
    # ------------------------------------------------------------------

    def _compute_latest_finish(self) -> dict[uuid.UUID, datetime]:
        """
        Backward-pass CPM.  task.end_time = EF; project.end_date = deadline.
        LF[t] = min(start_time of successors adjusted for lag) else project_end.
        """
        task_ids = {t.id for t in self.all_tasks}

        # Build successor adjacency: blocking_id → [(dependent_id, lag_hours)]
        successors: dict[uuid.UUID, list[tuple[uuid.UUID, float]]] = defaultdict(list)
        in_degree: dict[uuid.UUID, int] = {t.id: 0 for t in self.all_tasks}

        for dep in self.deps:
            if dep.dependency_type != "FS":
                continue
            if dep.blocking_task_id not in task_ids or dep.dependent_task_id not in task_ids:
                continue
            successors[dep.blocking_task_id].append(
                (dep.dependent_task_id, dep.lag_hours or 0.0)
            )
            in_degree[dep.dependent_task_id] += 1

        # Kahn's topological sort
        queue: deque[uuid.UUID] = deque(
            tid for tid, deg in in_degree.items() if deg == 0
        )
        topo: list[uuid.UUID] = []
        tmp_in = dict(in_degree)
        while queue:
            node = queue.popleft()
            topo.append(node)
            for (succ_id, _) in successors.get(node, []):
                tmp_in[succ_id] -= 1
                if tmp_in[succ_id] == 0:
                    queue.append(succ_id)

        # Project deadline (naive datetime)
        project_end = datetime.combine(self.project.end_date, datetime.min.time())

        # Backward pass
        lf: dict[uuid.UUID, datetime] = {}
        for tid in reversed(topo):
            succs = successors.get(tid, [])
            if not succs:
                lf[tid] = project_end
            else:
                succ_starts = []
                for (succ_id, lag_h) in succs:
                    succ_task = self.task_by_id.get(succ_id)
                    if succ_task:
                        succ_starts.append(
                            _naive(succ_task.start_time) - timedelta(hours=lag_h)
                        )
                lf[tid] = min(succ_starts) if succ_starts else project_end

        return lf

    # ------------------------------------------------------------------
    # Layer 1: Critical Path Impact — RED
    # ------------------------------------------------------------------

    def _check_critical_path(self, now: datetime) -> list[DelayWarning]:
        """Any overdue task on the critical path → RED alert."""
        warnings: list[DelayWarning] = []
        project_end = datetime.combine(self.project.end_date, datetime.min.time())

        for task in self.all_tasks:
            if task.status == "done":
                continue
            if not task.is_on_critical_path:
                continue
            task_end = _naive(task.end_time)
            if task_end >= now:
                continue

            delay = now - task_end
            delay_days = delay.days + (1 if delay.seconds > 0 else 0)
            new_est_end = project_end + timedelta(days=delay_days)

            warnings.append(DelayWarning(
                severity="red",
                layer=1,
                title=f"Trễ đường găng: {task.name}",
                detail=(
                    f"Công việc trên đường găng đã trễ {delay_days} ngày. "
                    f"Ngày kết thúc dự án ước tính mới: {new_est_end.date().isoformat()}."
                ),
                task_id=str(task.id),
                task_name=task.name,
                estimated_delay_days=delay_days,
            ))

        return warnings

    # ------------------------------------------------------------------
    # Layer 2: Slack/Float Consumption > 90% — ORANGE
    # ------------------------------------------------------------------

    def _check_slack_consumption(
        self,
        now: datetime,
        lf: dict[uuid.UUID, datetime],
    ) -> list[DelayWarning]:
        """Non-critical tasks that have consumed > 90% of their float → ORANGE."""
        warnings: list[DelayWarning] = []
        THRESHOLD = 0.90
        # Treat tasks with < 1 h of float as effectively critical → skip
        MIN_FLOAT_HOURS = 1.0

        for task in self.all_tasks:
            if task.status == "done":
                continue

            task_ef = _naive(task.end_time)
            task_lf = lf.get(task.id)
            if task_lf is None:
                continue

            total_float_sec = (task_lf - task_ef).total_seconds()
            if total_float_sec < MIN_FLOAT_HOURS * 3600:
                continue  # Effectively critical path — Layer 1 covers it

            if now <= task_ef:
                continue  # Task hasn't passed its scheduled finish → float intact

            consumed_sec = (now - task_ef).total_seconds()
            consumed_pct = consumed_sec / total_float_sec

            if consumed_pct < THRESHOLD:
                continue

            remaining_h = max(0.0, (task_lf - now).total_seconds() / 3600)

            warnings.append(DelayWarning(
                severity="orange",
                layer=2,
                title=f"Hết thời gian đệm: {task.name}",
                detail=(
                    f"Đã tiêu thụ {consumed_pct * 100:.0f}% thời gian đệm. "
                    f"Còn {remaining_h:.1f} giờ trước khi ảnh hưởng đến tiến độ dự án."
                ),
                task_id=str(task.id),
                task_name=task.name,
                estimated_delay_days=None,
            ))

        return warnings

    # ------------------------------------------------------------------
    # Layer 3: Progress Velocity — YELLOW
    # ------------------------------------------------------------------

    def _check_velocity(self, now: datetime) -> list[DelayWarning]:
        """
        When > 30% of scheduled time has elapsed but progress < 70% of expected,
        extrapolate completion date and warn if it overshoots the deadline.
        """
        warnings: list[DelayWarning] = []
        MIN_ELAPSED_PCT = 0.30      # Start checking after 30% of time elapsed
        VELOCITY_RATIO = 0.70       # Warn if progress < 70% of scheduled pace

        for task in self.all_tasks:
            if task.status in ("done", "review"):
                continue

            task_start = _naive(task.start_time)
            task_end = _naive(task.end_time)

            if now < task_start:
                continue  # Has not started yet

            total_duration_sec = (task_end - task_start).total_seconds()
            if total_duration_sec <= 0:
                continue

            elapsed_sec = (now - task_start).total_seconds()
            elapsed_pct = elapsed_sec / total_duration_sec

            if elapsed_pct < MIN_ELAPSED_PCT:
                continue  # Too early to make a reliable prediction

            progress_pct = min(self.progress_by_task.get(task.id, 0), 100) / 100.0
            expected_pct = elapsed_pct  # Expected pace: linear

            if progress_pct >= expected_pct * VELOCITY_RATIO:
                continue  # On track (within tolerable lag)

            # Predict completion date
            if progress_pct > 0:
                rate_per_sec = progress_pct / elapsed_sec
                remaining_work = 1.0 - progress_pct
                predicted_total_sec = elapsed_sec + remaining_work / rate_per_sec
                predicted_end = task_start + timedelta(seconds=predicted_total_sec)
                delay_days = max(0, (predicted_end - task_end).days)
                delay_txt = f"Dự kiến trễ ~{delay_days} ngày." if delay_days > 0 else "Tiệm cận hạn chót."
                detail = (
                    f"Đã qua {elapsed_pct * 100:.0f}% thời gian, "
                    f"chỉ hoàn thành {progress_pct * 100:.0f}%. "
                    f"{delay_txt}"
                )
            else:
                delay_days = None
                detail = (
                    f"Đã qua {elapsed_pct * 100:.0f}% thời gian "
                    f"nhưng chưa ghi nhận tiến độ nào. Cần kiểm tra ngay."
                )

            warnings.append(DelayWarning(
                severity="yellow",
                layer=3,
                title=f"Tiến độ chậm: {task.name}",
                detail=detail,
                task_id=str(task.id),
                task_name=task.name,
                estimated_delay_days=delay_days,
            ))

        return warnings

    # ------------------------------------------------------------------
    # Layer 4: Dependency Bottleneck — ORANGE
    # ------------------------------------------------------------------

    def _check_bottlenecks(self, now: datetime) -> list[DelayWarning]:
        """
        Blocking task is not done, but the dependent task is scheduled to start
        within HORIZON_DAYS → ORANGE alert.
        """
        warnings: list[DelayWarning] = []
        HORIZON_DAYS = 3
        horizon = now + timedelta(days=HORIZON_DAYS)

        seen: set[tuple[uuid.UUID, uuid.UUID]] = set()  # deduplicate per pair

        for dep in self.deps:
            if dep.dependency_type != "FS":
                continue

            blocking = self.task_by_id.get(dep.blocking_task_id)
            dependent = self.task_by_id.get(dep.dependent_task_id)
            if blocking is None or dependent is None:
                continue
            if blocking.status == "done":
                continue
            if dependent.status == "done":
                continue

            dep_start = _naive(dependent.start_time)
            if dep_start > horizon:
                continue

            key = (blocking.id, dependent.id)
            if key in seen:
                continue
            seen.add(key)

            days_until = max(0, (dep_start - now).days)

            warnings.append(DelayWarning(
                severity="orange",
                layer=4,
                title=f"Nghẽn phụ thuộc: {blocking.name}",
                detail=(
                    f"'{blocking.name}' chưa hoàn thành nhưng "
                    f"'{dependent.name}' sẽ bắt đầu trong {days_until} ngày. "
                    f"Cần hoàn thành ngay để tránh gián đoạn."
                ),
                task_id=str(blocking.id),
                task_name=blocking.name,
                estimated_delay_days=None,
            ))

        return warnings

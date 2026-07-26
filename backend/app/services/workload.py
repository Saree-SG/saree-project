"""Tính cân bằng tải (workload) — thuần, không phụ thuộc DB.

Tách riêng để unit-test được mà không cần Postgres. Dùng bởi
`api/routes/dashboard.py` (team-productivity, staffing-summary).

Công thức (Cách A — đã chốt với khách):
    capacity_hours   = số ngày công (T2–T6) trong kỳ × STANDARD_SHIFT_HOURS(8h)
    allocated_hours  = Σ estimated_hours task chưa xong (trống = DEFAULT_TASK_HOURS)
    workload_pct     = allocated / capacity × 100
    load_status      = <60 free · 60–100 stable · >100 overloaded
"""

from __future__ import annotations

from datetime import date, timedelta

STANDARD_SHIFT_HOURS = 8.0   # giờ/ca chuẩn (khớp attendance MAX_SHIFT_HOURS)
DEFAULT_TASK_HOURS = 8.0     # giờ ước tính mặc định khi task.estimated_hours trống
FREE_THRESHOLD = 60.0        # < 60% tải → rảnh
OVERLOAD_THRESHOLD = 100.0   # > 100% tải → quá tải


def business_days(start: date, end: date) -> int:
    """Số ngày làm việc (T2–T6) trong [start, end)."""
    days = 0
    cur = start
    while cur < end:
        if cur.weekday() < 5:   # 0=Mon .. 4=Fri
            days += 1
        cur += timedelta(days=1)
    return days


def capacity_hours(first: date, last: date) -> float:
    """Giờ khả dụng (Cách A) = ngày công chuẩn × ca 8h."""
    return round(business_days(first, last) * STANDARD_SHIFT_HOURS, 1)


def task_hours(estimated_hours: float | None) -> float:
    """Giờ ước tính của 1 task; trống → mặc định 8h."""
    return estimated_hours if estimated_hours is not None else DEFAULT_TASK_HOURS


def workload_pct(allocated: float, capacity: float) -> float:
    return round(allocated / capacity * 100, 1) if capacity > 0 else 0.0


def load_status(pct: float) -> str:
    if pct < FREE_THRESHOLD:
        return "free"
    if pct > OVERLOAD_THRESHOLD:
        return "overloaded"
    return "stable"


def load_recommendation(pct: float) -> str | None:
    if pct < FREE_THRESHOLD:
        return "Cần bố trí thêm việc"
    if pct > OVERLOAD_THRESHOLD:
        return "Quá tải — cân nhắc san việc"
    return None

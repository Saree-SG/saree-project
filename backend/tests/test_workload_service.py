"""Unit test thuần cho công thức cân bằng tải (không cần DB).

Bảo vệ công thức Cách A: capacity = ngày công × 8h, workload%, phân loại.
"""

from datetime import date

from app.services import workload as wl


def test_business_days_full_month_july_2026():
    # 2026-07: 23 ngày làm việc (T2–T6).
    assert wl.business_days(date(2026, 7, 1), date(2026, 8, 1)) == 23


def test_business_days_excludes_weekend():
    # 2026-07-25 (T7) và 26 (CN) không tính.
    assert wl.business_days(date(2026, 7, 25), date(2026, 7, 27)) == 0


def test_capacity_hours_is_days_times_shift():
    assert wl.capacity_hours(date(2026, 7, 1), date(2026, 8, 1)) == 23 * 8.0


def test_task_hours_default_when_none():
    assert wl.task_hours(None) == wl.DEFAULT_TASK_HOURS
    assert wl.task_hours(4.5) == 4.5


def test_workload_pct():
    assert wl.workload_pct(92.0, 184.0) == 50.0
    assert wl.workload_pct(0.0, 184.0) == 0.0
    assert wl.workload_pct(10.0, 0.0) == 0.0   # capacity 0 → 0, không chia 0


def test_load_status_thresholds():
    assert wl.load_status(0) == "free"
    assert wl.load_status(59.9) == "free"
    assert wl.load_status(60) == "stable"
    assert wl.load_status(100) == "stable"
    assert wl.load_status(100.1) == "overloaded"
    assert wl.load_status(150) == "overloaded"


def test_load_recommendation():
    assert wl.load_recommendation(30) is not None      # rảnh → gợi ý thêm việc
    assert wl.load_recommendation(80) is None           # ổn định → không
    assert wl.load_recommendation(120) is not None      # quá tải → cảnh báo

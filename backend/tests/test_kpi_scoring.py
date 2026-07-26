"""Unit tests for kpi_scoring.py — no DB needed."""

from datetime import datetime, timezone, timedelta, time

from app.services.kpi_scoring import ShiftThresholds, score_checkin, score_checkout, score_attendance

VN = timezone(timedelta(hours=7))

DEFAULT = ShiftThresholds()  # check_in_deadline=08:00, tolerance=10, half=60, full=180


def _vn(h: int, m: int = 0) -> datetime:
    """Return a VN-timezone aware datetime at 2026-07-26 HH:MM."""
    return datetime(2026, 7, 26, h, m, tzinfo=VN)


# ---------------------------------------------------------------------------
# Check-in scoring
# ---------------------------------------------------------------------------

def test_on_time_check_in():
    score = score_checkin(_vn(7, 55), DEFAULT)
    assert score.attendance_flag == "ok"
    assert score.kpi_weight == 1.0


def test_within_tolerance():
    score = score_checkin(_vn(8, 8), DEFAULT)  # 8 min late ≤ 10 tolerance
    assert score.attendance_flag == "ok"
    assert score.kpi_weight == 1.0


def test_late_check_in():
    score = score_checkin(_vn(8, 30), DEFAULT)  # 30 min late
    assert score.attendance_flag == "late"
    assert score.kpi_weight == 1.0
    assert "30" in score.attendance_label


def test_half_day_check_in():
    score = score_checkin(_vn(9, 15), DEFAULT)  # 75 min late > half_day(60)
    assert score.attendance_flag == "half_day"
    assert score.kpi_weight == 0.5


def test_full_day_check_in():
    score = score_checkin(_vn(11, 30), DEFAULT)  # 210 min late > full_day(180)
    assert score.attendance_flag == "full_day"
    assert score.kpi_weight == 0.0


# ---------------------------------------------------------------------------
# Check-out scoring
# ---------------------------------------------------------------------------

def test_on_time_check_out():
    score = score_checkout(_vn(17, 30), DEFAULT)  # after 17:00
    assert score.attendance_flag == "ok"
    assert score.kpi_weight == 1.0


def test_within_tolerance_checkout():
    score = score_checkout(_vn(16, 55), DEFAULT)  # 5 min early ≤ 10 tolerance
    assert score.attendance_flag == "ok"


def test_early_checkout():
    score = score_checkout(_vn(16, 20), DEFAULT)  # 40 min early
    assert score.attendance_flag == "early"
    assert score.kpi_weight == 1.0


def test_half_day_checkout():
    score = score_checkout(_vn(15, 45), DEFAULT)  # 75 min early
    assert score.attendance_flag == "half_day"
    assert score.kpi_weight == 0.5


# ---------------------------------------------------------------------------
# Combined scoring
# ---------------------------------------------------------------------------

def test_combined_takes_worst():
    # On time in, early out (half_day) → half_day
    score = score_attendance(_vn(8, 0), _vn(15, 45), DEFAULT)
    assert score.attendance_flag == "half_day"
    assert score.kpi_weight == 0.5


def test_combined_no_checkout():
    # Late check-in, no check-out yet
    score = score_attendance(_vn(8, 30), None, DEFAULT)
    assert score.attendance_flag == "late"
    assert score.kpi_weight == 1.0


def test_combined_both_ok():
    score = score_attendance(_vn(7, 50), _vn(17, 30), DEFAULT)
    assert score.attendance_flag == "ok"
    assert score.kpi_weight == 1.0

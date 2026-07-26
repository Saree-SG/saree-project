"""KPI scoring for attendance records (Bước 8 — Gap 41–44, 47–48).

Computes deviation_minutes, attendance_flag, attendance_label, kpi_weight
from the shift config thresholds. Pure functions — no DB access.

Thresholds (from AttendanceShiftConfig, defaults):
  tolerance_minutes = 10   → ≤10 min late/early → still "ok"
  half_day_minutes  = 60   → >60 min → half_day (kpi 0.5)
  full_day_minutes  = 180  → >180 min → full_day (kpi 0.0)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone, timedelta
import zoneinfo


@dataclass
class ShiftThresholds:
    check_in_deadline: time = time(8, 0)
    check_out_earliest: time = time(17, 0)
    tolerance_minutes: int = 10
    half_day_minutes: int = 60
    full_day_minutes: int = 180
    tz: str = "Asia/Ho_Chi_Minh"


@dataclass
class AttendanceScore:
    deviation_minutes: int
    attendance_flag: str   # ok | late | early | half_day | full_day
    attendance_label: str
    kpi_weight: float


def _local_time(dt: datetime, tz_name: str) -> datetime:
    """Convert an aware UTC datetime to the given local timezone."""
    try:
        tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        tz = zoneinfo.ZoneInfo("Asia/Ho_Chi_Minh")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz)


def _minutes_after(t: time, deadline: time) -> int:
    """Positive = t is after deadline (late/early). Negative = before."""
    t_mins = t.hour * 60 + t.minute
    d_mins = deadline.hour * 60 + deadline.minute
    return t_mins - d_mins


def score_checkin(check_in_at: datetime, cfg: ShiftThresholds) -> AttendanceScore:
    """Score a check-in against the shift deadline."""
    local = _local_time(check_in_at, cfg.tz)
    dev = _minutes_after(local.time(), cfg.check_in_deadline)

    if dev <= 0 or dev <= cfg.tolerance_minutes:
        return AttendanceScore(max(0, dev), "ok", "Đúng giờ", 1.0)
    if dev > cfg.full_day_minutes:
        return AttendanceScore(dev, "full_day", f"Không đi làm cả ngày (+{dev} phút)", 0.0)
    if dev > cfg.half_day_minutes:
        return AttendanceScore(dev, "half_day", f"Không làm ½ ngày (+{dev} phút)", 0.5)
    return AttendanceScore(dev, "late", f"Đi trễ {dev} phút", 1.0)


def score_checkout(check_out_at: datetime, cfg: ShiftThresholds) -> AttendanceScore:
    """Score a check-out against the earliest allowed check-out time."""
    local = _local_time(check_out_at, cfg.tz)
    # Negative dev = checked out before earliest (early departure)
    dev = _minutes_after(cfg.check_out_earliest, local.time())  # how early

    if dev <= 0 or dev <= cfg.tolerance_minutes:
        return AttendanceScore(0, "ok", "Đúng giờ", 1.0)
    if dev > cfg.full_day_minutes:
        return AttendanceScore(dev, "full_day", f"Về sớm quá nhiều ({dev} phút sớm)", 0.0)
    if dev > cfg.half_day_minutes:
        return AttendanceScore(dev, "half_day", f"Về sớm ½ ngày ({dev} phút sớm)", 0.5)
    return AttendanceScore(dev, "early", f"Về sớm {dev} phút", 1.0)


def score_attendance(
    check_in_at: datetime,
    check_out_at: datetime | None,
    cfg: ShiftThresholds,
) -> AttendanceScore:
    """Combine check-in + check-out scores, return the worse one."""
    in_score = score_checkin(check_in_at, cfg)
    if check_out_at is None:
        return in_score
    out_score = score_checkout(check_out_at, cfg)
    # Worse = lower kpi_weight; tie → higher deviation
    if out_score.kpi_weight < in_score.kpi_weight:
        return out_score
    if in_score.kpi_weight < out_score.kpi_weight:
        return in_score
    # Same weight — pick higher deviation for label accuracy
    return in_score if in_score.deviation_minutes >= out_score.deviation_minutes else out_score

"""Unit tests for travel.py — no DB needed."""

from datetime import datetime, timezone, timedelta

import pytest

from app.services.travel import haversine_km, travel_minutes, check_travel_feasibility

VN = timezone(timedelta(hours=7))


def test_haversine_hanoi_hcm():
    # Hà Nội → TP HCM ≈ 1138 km
    d = haversine_km(21.0285, 105.8542, 10.8231, 106.6297)
    assert 1100 < d < 1180


def test_haversine_same_point_is_zero():
    assert haversine_km(10.0, 106.0, 10.0, 106.0) == pytest.approx(0.0, abs=1e-6)


def test_haversine_short_distance():
    # Two points ~2 km apart in HCM
    d = haversine_km(10.7769, 106.7009, 10.7950, 106.7009)
    assert 1.5 < d < 2.5


def test_travel_minutes_default_params():
    # 10 km crow-flies × 1.4 road / 35 kmh × 60 = 24 min
    mins = travel_minutes(10.0)
    assert mins == 24


def test_travel_minutes_zero_distance():
    assert travel_minutes(0.0) == 0


def test_travel_minutes_ceil():
    # 5 km × 1.4 / 35 × 60 = 12 min exactly
    assert travel_minutes(5.0) == 12


def test_feasibility_feasible():
    now = datetime(2026, 7, 26, 8, 0, tzinfo=VN)
    # Previous task ends at 08:00; arrive_at = 09:00; distance ≈ 5 km → ~12 min → kịp
    result = check_travel_feasibility(
        from_lat=10.7769, from_lng=106.7009,
        to_lat=10.7950, to_lng=106.7009,
        departure_time=now,
        must_arrive_by=datetime(2026, 7, 26, 9, 0, tzinfo=VN),
    )
    assert result["feasible"] is True
    assert result["distance_km"] > 0
    assert result["travel_minutes"] > 0
    assert "Kịp" in result["message"]


def test_feasibility_not_feasible():
    now = datetime(2026, 7, 26, 8, 0, tzinfo=VN)
    # Must arrive at 08:05 but ~20km away → not feasible
    result = check_travel_feasibility(
        from_lat=10.7769, from_lng=106.7009,
        to_lat=10.9500, to_lng=106.7009,  # ~19 km
        departure_time=now,
        must_arrive_by=datetime(2026, 7, 26, 8, 5, tzinfo=VN),
    )
    assert result["feasible"] is False
    assert "Không kịp" in result["message"]
    assert "earliest_arrival" in result


def test_feasibility_naive_timestamps():
    # Should not raise even if timestamps are tz-naive (treated as UTC)
    dep = datetime(2026, 7, 26, 1, 0)  # naive
    arr = datetime(2026, 7, 26, 2, 0)  # naive
    result = check_travel_feasibility(
        from_lat=10.7, from_lng=106.7,
        to_lat=10.8, to_lng=106.8,
        departure_time=dep,
        must_arrive_by=arr,
    )
    assert "feasible" in result

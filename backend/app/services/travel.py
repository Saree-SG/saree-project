"""Travel-time estimation for dispatch conflict detection.

Uses haversine (straight-line) distance × road_factor / speed_kmh.
All thresholds are configurable per-tenant via Company settings;
defaults match the spec (road_factor=1.4, speed=35 km/h for motorbike).
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone


# Per-spec defaults — callers may override with Company settings later.
DEFAULT_ROAD_FACTOR = 1.4     # road distance ≈ 1.4× crow-flies
DEFAULT_SPEED_KMH = 35.0      # motorbike average in city


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two GPS points in km."""
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lng2 - lng1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def travel_minutes(
    distance_km: float,
    road_factor: float = DEFAULT_ROAD_FACTOR,
    speed_kmh: float = DEFAULT_SPEED_KMH,
) -> int:
    """Estimated travel time in whole minutes (ceil)."""
    if speed_kmh <= 0:
        return 9999
    road_km = distance_km * road_factor
    return math.ceil(road_km / speed_kmh * 60)


def check_travel_feasibility(
    *,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    departure_time: datetime,
    must_arrive_by: datetime,
    road_factor: float = DEFAULT_ROAD_FACTOR,
    speed_kmh: float = DEFAULT_SPEED_KMH,
) -> dict:
    """Return a travel feasibility dict for the conflict-check API response.

    Args:
        from_lat/lng: worker's current (estimated) position.
        to_lat/lng: destination (project site).
        departure_time: when the worker can leave the previous location.
        must_arrive_by: `arrive_at` of the new task.
        road_factor/speed_kmh: tenant-level config (defaults per spec).

    Returns dict with keys: distance_km, travel_minutes, feasible,
    earliest_arrival (ISO string, tz-aware), message.
    """
    dist_km = haversine_km(from_lat, from_lng, to_lat, to_lng)
    mins = travel_minutes(dist_km, road_factor, speed_kmh)
    earliest = departure_time + timedelta(minutes=mins)

    # Ensure both timestamps are tz-aware for comparison
    if must_arrive_by.tzinfo is None:
        must_arrive_by = must_arrive_by.replace(tzinfo=timezone.utc)
    if earliest.tzinfo is None:
        earliest = earliest.replace(tzinfo=timezone.utc)

    feasible = earliest <= must_arrive_by

    if feasible:
        message = f"Kịp di chuyển. Khoảng cách ~{dist_km:.1f}km (~{mins} phút)."
    else:
        vn_fmt = earliest.astimezone(
            timezone(timedelta(hours=7))
        ).strftime("%H:%M %d/%m")
        message = (
            f"Không kịp di chuyển! Cách ~{dist_km:.1f}km (~{mins} phút). "
            f"Nên hẹn từ {vn_fmt} trở đi."
        )

    return {
        "distance_km": round(dist_km, 2),
        "travel_minutes": mins,
        "feasible": feasible,
        "earliest_arrival": earliest.isoformat(),
        "message": message,
    }

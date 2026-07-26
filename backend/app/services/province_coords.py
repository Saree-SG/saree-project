"""Static lookup table: 63 Vietnamese provinces → (lat, lng) centre points.

Used as last-resort fallback for staff location when no task/attendance GPS available.
"""

from __future__ import annotations

# Province name → (lat, lng) — WGS84 approximate centres
PROVINCE_COORDS: dict[str, tuple[float, float]] = {
    "An Giang": (10.5216, 105.1259),
    "Bà Rịa - Vũng Tàu": (10.5417, 107.2429),
    "Bắc Giang": (21.2820, 106.1974),
    "Bắc Kạn": (22.1470, 105.8348),
    "Bạc Liêu": (9.2940, 105.7216),
    "Bắc Ninh": (21.1861, 106.0763),
    "Bến Tre": (10.2433, 106.3750),
    "Bình Định": (13.7757, 109.2234),
    "Bình Dương": (11.1640, 106.6519),
    "Bình Phước": (11.7512, 106.9234),
    "Bình Thuận": (11.0904, 108.0721),
    "Cà Mau": (9.1769, 105.1524),
    "Cần Thơ": (10.0452, 105.7469),
    "Cao Bằng": (22.6657, 106.2522),
    "Đà Nẵng": (16.0544, 108.2022),
    "Đắk Lắk": (12.7100, 108.2378),
    "Đắk Nông": (12.0000, 107.6833),
    "Điện Biên": (21.3860, 103.0230),
    "Đồng Nai": (10.9453, 107.0843),
    "Đồng Tháp": (10.4938, 105.6882),
    "Gia Lai": (13.9833, 108.0000),
    "Hà Giang": (22.8026, 104.9784),
    "Hà Nam": (20.5835, 105.9230),
    "Hà Nội": (21.0285, 105.8542),
    "Hà Tĩnh": (18.3559, 105.8877),
    "Hải Dương": (20.9373, 106.3145),
    "Hải Phòng": (20.8449, 106.6881),
    "Hậu Giang": (9.7579, 105.6413),
    "Hòa Bình": (20.6858, 105.3378),
    "Hưng Yên": (20.6464, 106.0512),
    "Khánh Hòa": (12.2388, 109.1967),
    "Kiên Giang": (10.0125, 105.0809),
    "Kon Tum": (14.3497, 108.0005),
    "Lai Châu": (22.3964, 103.4590),
    "Lâm Đồng": (11.5753, 108.1429),
    "Lạng Sơn": (21.8537, 106.7615),
    "Lào Cai": (22.4809, 103.9754),
    "Long An": (10.5354, 106.4103),
    "Nam Định": (20.4388, 106.1621),
    "Nghệ An": (19.2342, 104.9200),
    "Ninh Bình": (20.2506, 105.9745),
    "Ninh Thuận": (11.5645, 108.9885),
    "Phú Thọ": (21.4200, 105.2233),
    "Phú Yên": (13.0882, 109.0929),
    "Quảng Bình": (17.4689, 106.5992),
    "Quảng Nam": (15.5394, 108.0191),
    "Quảng Ngãi": (15.1214, 108.8042),
    "Quảng Ninh": (21.0063, 107.2925),
    "Quảng Trị": (16.7403, 107.1854),
    "Sóc Trăng": (9.6026, 105.9739),
    "Sơn La": (21.3256, 103.9188),
    "Tây Ninh": (11.3351, 106.1098),
    "Thái Bình": (20.4487, 106.3422),
    "Thái Nguyên": (21.5671, 105.8252),
    "Thanh Hóa": (19.8067, 105.7851),
    "Thừa Thiên Huế": (16.4637, 107.5909),
    "Tiền Giang": (10.4493, 106.3421),
    "TP. Hồ Chí Minh": (10.8231, 106.6297),
    "Trà Vinh": (9.9477, 106.3456),
    "Tuyên Quang": (21.8194, 105.2180),
    "Vĩnh Long": (10.2395, 105.9572),
    "Vĩnh Phúc": (21.3609, 105.5474),
    "Yên Bái": (21.7051, 104.8709),
}

DEFAULT_COORDS = (10.7399343, 106.5857629)  # Công ty TNHH Điện Lạnh Saigon, TP.HCM


def coords_for_province(province: str | None) -> tuple[float, float]:
    """Return (lat, lng) for a province name, or Vietnam centre if not found."""
    if not province:
        return DEFAULT_COORDS
    # Try exact match first
    if province in PROVINCE_COORDS:
        return PROVINCE_COORDS[province]
    # Partial match (e.g. "Hồ Chí Minh" → "TP. Hồ Chí Minh")
    for key, coords in PROVINCE_COORDS.items():
        if province in key or key in province:
            return coords
    return DEFAULT_COORDS

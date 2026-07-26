"""Chặn lỗi deploy prod: Alembic phải có ĐÚNG 1 head.

`prestart.sh` chạy `alembic upgrade head` khi khởi động. Nếu có nhiều head
(nhánh migration không merge) thì lệnh này fail → backend prod không lên.
Test này đọc file version (không cần DB) và đảm bảo đúng 1 head + không trùng
revision id.
"""

from __future__ import annotations

import pathlib
import re

VERSIONS_DIR = pathlib.Path(__file__).resolve().parents[1] / "app" / "alembic" / "versions"

_REV = re.compile(r"^revision\s*(?::[^=]*)?=\s*(.+)$", re.MULTILINE)
_DOWN = re.compile(r"^down_revision\s*(?::[^=]*)?=\s*(.+)$", re.MULTILINE)


def _literals(expr: str) -> list[str]:
    """Trích các chuỗi id trong 1 biểu thức (str hoặc tuple hoặc None)."""
    return re.findall(r"""['"]([^'"]+)['"]""", expr)


def _collect() -> tuple[set[str], set[str]]:
    revisions: set[str] = set()
    down_refs: set[str] = set()
    for f in VERSIONS_DIR.glob("*.py"):
        text = f.read_text(encoding="utf-8")
        for m in _REV.findall(text):
            revisions.update(_literals(m))
        for m in _DOWN.findall(text):
            down_refs.update(_literals(m))
    return revisions, down_refs


def test_no_duplicate_revision_ids():
    ids: list[str] = []
    for f in VERSIONS_DIR.glob("*.py"):
        text = f.read_text(encoding="utf-8")
        for m in _REV.findall(text):
            ids.extend(_literals(m))
    dupes = {r for r in ids if ids.count(r) > 1}
    assert not dupes, f"Revision id trùng: {dupes}"


def test_exactly_one_alembic_head():
    revisions, down_refs = _collect()
    heads = revisions - down_refs
    assert len(heads) == 1, (
        f"Alembic phải có đúng 1 head, đang có {len(heads)}: {sorted(heads)}. "
        "Nhiều head làm `alembic upgrade head` fail khi deploy prod — cần merge."
    )

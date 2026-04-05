import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models.org import Company
from app.models.user import User
from sqlmodel import select


def _ensure_company_for_user(db: Session, user: User) -> uuid.UUID:
    """Ensure the given user has a company_id for chat tests."""

    if user.company_id:
        return user.company_id
    c = Company(name="Test Co", slug=f"test-co-{uuid.uuid4().hex[:8]}")
    db.add(c)
    db.commit()
    db.refresh(c)
    user.company_id = c.id
    db.add(user)
    db.commit()
    db.refresh(user)
    return c.id


def test_chat_room_and_ws_smoke(client: TestClient, db: Session, superuser_token_headers: dict[str, str]) -> None:
    me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    assert me is not None
    _ensure_company_for_user(db, me)

    r = client.post(
        f"{settings.API_V1_STR}/chat/rooms",
        headers=superuser_token_headers,
        json={"room_type": "group", "name": "General", "member_user_ids": []},
    )
    assert r.status_code == 201
    room = r.json()
    room_id = room["id"]

    with client.websocket_connect(
        f"{settings.API_V1_STR}/chat/ws?room_id={room_id}",
        headers=superuser_token_headers,
    ) as ws:
        ws.send_json({"type": "message.send", "content": "hello"})
        msg = ws.receive_json()
        assert msg["type"] in {"presence.join", "message.new"}
        if msg["type"] == "presence.join":
            msg = ws.receive_json()
        assert msg["type"] == "message.new"
        assert msg["message"]["content"] == "hello"

    r2 = client.get(
        f"{settings.API_V1_STR}/chat/rooms/{room_id}/messages",
        headers=superuser_token_headers,
    )
    assert r2.status_code == 200
    history = r2.json()
    assert any(m.get("content") == "hello" for m in history)


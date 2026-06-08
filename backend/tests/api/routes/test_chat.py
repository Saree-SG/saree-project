import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models.notification import Notification
from app.models.org import Company
from app.models.user import User
from sqlmodel import select

from tests.utils.user import create_random_user


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


def test_ws_message_notifies_other_members(
    client: TestClient, db: Session, superuser_token_headers: dict[str, str]
) -> None:
    """A message sent over the WebSocket must create an in-app notification
    for the *other* members of the room (the same path that fires web push).

    Regression guard: the WS `message.send` handler used to write the message
    directly via the repo and skip notification/push entirely, so chat pushes
    never arrived while task pushes did.
    """
    me = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    assert me is not None
    company_id = _ensure_company_for_user(db, me)

    # A second member in the same company (cross-company members are rejected).
    other = create_random_user(db)
    other.company_id = company_id
    db.add(other)
    db.commit()
    db.refresh(other)

    r = client.post(
        f"{settings.API_V1_STR}/chat/rooms",
        headers=superuser_token_headers,
        json={
            "room_type": "group",
            "name": "Notify Room",
            "member_user_ids": [str(other.id)],
        },
    )
    assert r.status_code == 201
    room_id = r.json()["id"]

    with client.websocket_connect(
        f"{settings.API_V1_STR}/chat/ws?room_id={room_id}",
        headers=superuser_token_headers,
    ) as ws:
        ws.send_json({"type": "message.send", "content": "ping"})
        msg = ws.receive_json()
        if msg["type"] == "presence.join":
            msg = ws.receive_json()
        assert msg["type"] == "message.new"

    # The recipient (not the sender) should have a chat_message notification.
    notifs = db.exec(
        select(Notification).where(Notification.user_id == other.id)
    ).all()
    chat_notifs = [
        n
        for n in notifs
        if n.type == "chat_message"
        and n.entity_type == "chat"
        and n.entity_id == uuid.UUID(room_id)
    ]
    assert chat_notifs, "WS message did not create a notification for the recipient"
    assert chat_notifs[0].body == "ping"

    # The sender must not be notified about their own message.
    sender_notifs = db.exec(
        select(Notification).where(
            Notification.user_id == me.id,
            Notification.entity_id == uuid.UUID(room_id),
        )
    ).all()
    assert not sender_notifs


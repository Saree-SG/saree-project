# Docker Compose — nên dùng file nào?

Chỉ có **4 file**; mỗi file một việc.

| File | Mục đích | Khi nào dùng |
|------|-----------|----------------|
| **`compose.yml`** | Stack gốc: Postgres, Redis, backend, frontend, v.v. | Luôn là nền của môi trường dev. |
| **`compose.override.yml`** | Chỉnh **máy dev**: mount code, Traefik test cục bộ, mailcatcher, v.v. | Docker **tự động** ghép file này lên `compose.yml` khi bạn chạy `docker compose` (không cần `-f`). |
| **`compose.prod.yml`** | Stack **production**: Traefik labels, volume upload, `prestart`/migration. | Chỉ trên **server** (có network `traefik-public` + `.env` prod). |
| **`compose.traefik.yml`** | Một Traefik **riêng** làm HTTPS cho cả server (Let’s Encrypt). | Chạy **một lần** trên server, *trước* stack app (xem `deployment.md`). |

## Lệnh gọn (khuyến nghị)

Dùng wrapper (không cần nhớ `-f`):

```bash
./scripts/docker.sh dev up --build
./scripts/docker.sh dev watch
./scripts/docker.sh prod up -d
./scripts/docker.sh traefik up -d
```

Tương đương thủ công:

| Môi trường | Lệnh tương đương |
|------------|------------------|
| Dev (mặc định) | `docker compose …` |
| Production app | `docker compose -f compose.prod.yml …` |
| Traefik public | `docker compose -f compose.traefik.yml …` |

## Ghi nhớ nhanh

- **Dev máy bạn:** chỉ cần `docker compose up` (hoặc `./scripts/docker.sh dev up`). Hai file `compose.yml` + `compose.override.yml` được gộp tự động.
- **Deploy server:** không dùng `compose.override.yml`. Chỉ `compose.prod.yml` (+ Traefik đã bật bằng `compose.traefik.yml`).
- **Backup/restore DB:** `scripts/db_dump.sh` (dev), `scripts/db_restore.sh` (server, trỏ `compose.prod.yml` hoặc `COMPOSE_FILE`).

Chi tiết deploy: [deployment.md](./deployment.md).

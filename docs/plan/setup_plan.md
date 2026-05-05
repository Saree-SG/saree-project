# Plan: CI/CD Deploy lên Windows Workstation (Khách hàng)

## Context

Hệ thống Saree ERP cần được deploy lên máy Windows workstation của khách hàng. Chưa có domain, tạm truy cập qua IP:port nội bộ. Khi có domain sau này sẽ chuyển sang Traefik. Mục tiêu: developer có thể push code từ nhà → tự động deploy dev, hoặc trigger thủ công để deploy production. Xem log qua SSH.

**Branch strategy:**
- Push lên `dev` → tự động deploy dev environment
- Push lên `releases` → phải bấm nút thủ công (workflow_dispatch) mới deploy production

---

## Tổng quan kiến trúc

```
Developer (nhà) ──push──► GitHub ──trigger──► Self-hosted Runner (Windows PC khách)
                                                        │
                                               Docker Compose up/down
                                                        │
                                          ┌─────────────┼─────────────┐
                                       Dev Stack      Prod Stack    Portainer
                                   (port 3000/8100)  (port 80/8000)  (9000)
```

**Remote access:** Tailscale (zero-config VPN) → SSH vào Windows → `docker logs`

---

## Files cần tạo

### 1. `compose.local.yml` (mới)
Thay thế `compose.prod.yml` cho môi trường không có domain/Traefik. Dùng direct port binding.

**Dịch vụ:**
- `db` – PostgreSQL 18, volume persistent
- `redis` – Redis 7.4, appendonly
- `prestart` – chạy migrations trước
- `backend` – FastAPI, port `${BACKEND_PORT:-8000}`
- `frontend` – Nginx, port `${FRONTEND_PORT:-80}`
- `celery_worker` + `celery_beat`
- `adminer` – port `${ADMINER_PORT:-8181}` (DB UI)

**Không có:** Traefik labels, `traefik-public` network, Let's Encrypt

### 2. `.github/workflows/deploy-dev.yml` (mới)
```
Trigger: push to branch `dev`
Runner: self-hosted, label: [dev]
Env vars: từ GitHub Secrets với prefix DEV_
Ports: FRONTEND_PORT=3000, BACKEND_PORT=8100, ADMINER_PORT=8282
Stack: STACK_NAME=saree-dev (tránh conflict với prod)
Steps:
  1. Checkout code
  2. Tạo .env từ secrets
  3. docker compose -f compose.local.yml --project-name saree-dev up --build -d
  4. Verify health check
```

### 3. `.github/workflows/deploy-prod.yml` (mới)
```
Trigger: workflow_dispatch (thủ công) trên branch `releases`
Runner: self-hosted, label: [production]
Env vars: từ GitHub Secrets với prefix PROD_
Ports: FRONTEND_PORT=80, BACKEND_PORT=8000, ADMINER_PORT=8181
Stack: STACK_NAME=saree-prod
Steps:
  1. Checkout code
  2. Tạo .env từ secrets
  3. docker compose -f compose.local.yml --project-name saree-prod up --build -d
  4. Verify health check
```

### 4. `.env.server.example` (mới)
Template cho file `.env` trên server Windows, với các biến cần thay đổi được đánh dấu rõ.

### 5. `docs/windows-setup.md` (mới)
Checklist chi tiết setup máy Windows A-Z.

---

## GitHub Secrets cần cấu hình

| Secret | Dùng cho |
|--------|----------|
| `DEV_SECRET_KEY` | JWT signing key môi trường dev |
| `DEV_POSTGRES_PASSWORD` | DB password dev |
| `DEV_FIRST_SUPERUSER_PASSWORD` | Admin password dev |
| `PROD_SECRET_KEY` | JWT signing key production |
| `PROD_POSTGRES_PASSWORD` | DB password production |
| `PROD_FIRST_SUPERUSER_PASSWORD` | Admin password production |
| `FIRST_SUPERUSER` | Email admin (dùng chung) |

---

## Checklist setup máy Windows (docs/windows-setup.md)

### Bước 1: Cài đặt cơ bản
- [ ] Enable WSL2: `wsl --install` (PowerShell Admin)
- [ ] Cài Docker Desktop (WSL2 backend)
- [ ] Cài Git for Windows
- [ ] Cài OpenSSH Server: Settings → Apps → Optional Features → OpenSSH Server
- [ ] Bật và set auto-start OpenSSH: `Start-Service sshd; Set-Service -Name sshd -StartupType Automatic`

### Bước 2: Remote access từ nhà
- [ ] Cài Tailscale trên máy Windows khách: https://tailscale.com/download/windows
- [ ] Cài Tailscale trên máy developer
- [ ] Cả hai join cùng Tailscale network → SSH qua Tailscale IP

### Bước 3: GitHub Actions Self-Hosted Runner
- [ ] Tạo 2 runner instances trên cùng máy (hoặc 1 runner với 2 labels nếu chỉ cần 1 env):
  - Runner 1: label `dev` – chạy như Windows Service
  - Runner 2: label `production` – chạy như Windows Service
- [ ] Mỗi runner đặt trong thư mục riêng: `C:\actions-runner-dev\`, `C:\actions-runner-prod\`
- [ ] Cài như service: `.\svc.sh install` rồi `.\svc.sh start` (trong Git Bash hoặc WSL)

### Bước 4: Chuẩn bị Docker
- [ ] Tạo thư mục project: `C:\saree-erp\dev\` và `C:\saree-erp\prod\`
- [ ] Tạo file `.env` cho mỗi env (dựa theo `.env.server.example`)
- [ ] Test Docker: `docker run hello-world`

### Bước 5: Cấu hình GitHub Secrets
- [ ] Vào GitHub repo → Settings → Secrets and variables → Actions
- [ ] Thêm tất cả secrets theo bảng trên

---

## Port assignments (khi chưa có domain)

| Env | Frontend | Backend API | Adminer |
|-----|----------|-------------|---------|
| Dev | :3000 | :8100 | :8282 |
| Production | :80 | :8000 | :8181 |

Truy cập: `http://<tailscale-ip>:3000` (dev), `http://<tailscale-ip>` (prod)

---

## Xem log từ xa

```bash
# SSH vào máy khách qua Tailscale
ssh user@<tailscale-ip>

# Xem log real-time
docker logs -f saree-prod-backend-1

# Xem log tất cả services
docker compose -f C:\saree-erp\prod\compose.local.yml -p saree-prod logs -f
```

---

## Khi có domain (future)

1. Setup DNS trỏ về IP khách (cần port-forward 80/443 trên router của khách, hoặc dùng Cloudflare Tunnel)
2. Chuyển từ `compose.local.yml` sang `compose.prod.yml` + `compose.traefik.yml`
3. Update GitHub workflow dùng `compose.prod.yml`
4. Update env: `DOMAIN=customer-domain.com`

**Windows compatibility với Traefik:** Docker Desktop WSL2 backend expose unix socket `/var/run/docker.sock` bình thường nên `compose.traefik.yml` hiện tại KHÔNG cần sửa để chạy trên Windows. Traefik container mount socket đó hoạt động được.

**Lý do không dùng Traefik ở giai đoạn hiện tại:** Traefik routing dựa vào `Host('api.${DOMAIN}')` — không có domain thì request không match rule nào. Direct port binding (`compose.local.yml`) là cách đúng khi chưa có domain.

---

## Files cần modify

- Không modify file nào hiện có (tất cả là file mới)

## Files tạo mới

1. `compose.local.yml`
2. `.github/workflows/deploy-dev.yml`
3. `.github/workflows/deploy-prod.yml`
4. `.env.server.example`
5. `docs/windows-setup.md`

## Verification

1. Push thử lên branch `dev` → kiểm tra GitHub Actions tab thấy workflow chạy → truy cập `http://localhost:3000` (trên máy server) thấy app
2. Vào GitHub Actions → chọn `deploy-prod.yml` → Run workflow → kiểm tra `http://localhost`
3. SSH vào máy → `docker ps` thấy các container chạy
4. `docker logs -f saree-dev-backend-1` xem log

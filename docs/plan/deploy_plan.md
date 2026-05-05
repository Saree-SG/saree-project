# Production Deployment Plan — Saree ERP

## Context

Cần deploy hệ thống lên máy chủ vật lý của khách hàng (Xeon CPU, RAM 12GB, hiện chạy Windows).
Yêu cầu:
- Chạy toàn bộ stack qua Docker
- Dữ liệu PostgreSQL không bị mất khi shutdown container
- Cronjob tự động backup DB hằng ngày + upload cloud + notify admin
- 2 môi trường: **UAT** và **Production** trên cùng 1 server
- HTTPS qua Traefik + SSL Let's Encrypt (miễn phí, tự động gia hạn)
- Domain cần mua (~$10-15/năm), trỏ DNS về IP server
- Bảo mật tối thiểu (rate limit, HTTPS-only, security headers)

Cơ sở hạ tầng hiện tại: Traefik + Let's Encrypt đã được cấu hình trong `compose.traefik.yml` và `compose.prod.yml`. Scripts backup đã có (`scripts/db_dump.sh`, `scripts/db_restore.sh`). Cần hoàn thiện thêm.

---

## Phase 0 — Chuẩn bị Hệ Điều Hành & Domain (Quan trọng nhất)

### 0.1 Hệ điều hành — KHÔNG dùng WSL2 cho production

**Tại sao WSL2 không phù hợp:**
- Windows OS chiếm ~2-3GB RAM trước → WSL2 thực tế chỉ có ~8-9GB trong tổng số 12GB
- Port forwarding WSL2 → Windows host không ổn định, dễ bị conflict
- WSL2 không tự start khi Windows boot (phải viết script phức tạp)
- Windows Update có thể tự restart máy → downtime không báo trước
- Docker networking trong WSL2 có thêm lớp NAT → phức tạp hơn

**Khuyến nghị: Cài Ubuntu Server 22.04 LTS**
- Có thể dual-boot (giữ Windows) hoặc thay hẳn (khuyến nghị nếu máy chỉ làm server)
- Ubuntu Server không có GUI → nhẹ hơn, ~300MB RAM cho OS
- Docker native, crontab native, SSH native
- Cách cài: download ISO từ ubuntu.com, burn USB, boot và cài

```
# Sau khi cài Ubuntu Server:
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw
```

### 0.2 Domain — Cần mua và cấu hình DNS

**Mua domain:**
- Nhà cung c cấp VN: Matbao.net, PA Vietnam (~200-300k/năm)
- Quốc tế: Namecheap.com (~$10-12/năm) — giao diện tiếng Anh
- Ví dụ: `saree-client.vn` hoặc `erp-companyname.com`

**Cấu hình DNS sau khi mua** (thêm A records):
```
# UAT environment
uat.example.com          A    <IP-server>
api.uat.example.com      A    <IP-server>

# Production
example.com              A    <IP-server>
api.example.com          A    <IP-server>
traefik.example.com      A    <IP-server>   # Traefik dashboard (admin only)
```

**Traefik là gì?**
Traefik là **reverse proxy** — phần mềm đứng trước tất cả services, làm 3 việc:
1. Nhận traffic từ port 80/443
2. Route đến đúng service theo domain (api.example.com → backend, example.com → frontend)
3. **Tự động cấp và gia hạn SSL certificate miễn phí** qua Let's Encrypt

→ Traefik miễn phí, open source, không cần mua gì thêm.
→ SSL/HTTPS miễn phí hoàn toàn qua Let's Encrypt.
→ Chi phí duy nhất: tiền mua domain hằng năm.

---

## Phase 1 — Dữ liệu an toàn khi shutdown (Data Persistence)

### Vấn đề & giải pháp

PostgreSQL trong Docker lưu dữ liệu vào **named volume** (`app-db-data`), KHÔNG phải container layer. Tức là:
- `docker compose down` → dữ liệu **an toàn** ✅
- `docker compose down -v` hoặc `docker volume rm` → dữ liệu **mất** ❌

**Hành động:**
- Thêm cảnh báo rõ vào `docs/deployment.md`: tuyệt đối không chạy `docker compose down -v` trên production
- Thêm bind mount để volume PostgreSQL map sang thư mục host thực tế (phòng trường hợp volume bị xóa nhầm):

Trong `compose.prod.yml`, sửa volumes của `db` từ named volume sang bind mount:
```yaml
# compose.prod.yml - service db
volumes:
  - /opt/saree-erp/data/postgres:/var/lib/postgresql/data/pgdata
```

Tương tự cho uploads:
```yaml
# backend service
volumes:
  - /opt/saree-erp/data/uploads:/data/uploads
```

Tạo thư mục host trước khi chạy: `mkdir -p /opt/saree-erp/data/postgres /opt/saree-erp/data/uploads /opt/saree-erp/backups`

**Files cần sửa:** `compose.prod.yml`

---

## Phase 2 — Cronjob Backup Hằng Ngày + Notify Admin

### 2.1 Hoàn thiện script backup có notification + upload cloud

Tạo mới `scripts/db_backup_full.sh` (thay thế `db_dump.sh` cũ):

```bash
#!/bin/bash
# scripts/db_backup_full.sh
# Backup DB → lưu local → upload Google Drive → notify admin

set -euo pipefail

BACKUP_DIR="/opt/saree-erp/backups/prod"
RETENTION_DAYS=30
LOG_FILE="/var/log/saree-backup.log"
ENV_FILE="/opt/saree-erp/.env.prod"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="$BACKUP_DIR/saree_${TIMESTAMP}.dump"

# Load env
source "$ENV_FILE"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "=== Backup bắt đầu ==="

# 1. Chạy pg_dump
docker compose --env-file "$ENV_FILE" -f /opt/saree-erp/compose.prod.yml \
  exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z6 > "$DUMP_FILE"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
log "pg_dump OK: $DUMP_FILE ($DUMP_SIZE)"

# 2. Upload lên Google Drive (dùng rclone)
rclone copy "$DUMP_FILE" "gdrive:saree-erp-backups/prod/" --log-file="$LOG_FILE"
log "Upload Google Drive OK"

# 3. Xóa backup local cũ hơn 30 ngày
find "$BACKUP_DIR" -name "*.dump" -mtime +$RETENTION_DAYS -delete
log "Cleanup OK (giữ $RETENTION_DAYS ngày gần nhất)"

# 4. Notify admin qua email (nếu cấu hình SMTP)
if [ -n "${ADMIN_EMAIL:-}" ]; then
  echo "Backup OK lúc $(date). File: $DUMP_FILE ($DUMP_SIZE)" | \
    mail -s "[Saree ERP] Backup thành công $(date +%Y-%m-%d)" "$ADMIN_EMAIL"
fi

log "=== Backup hoàn tất ==="
```

**Script khi backup THẤT BẠI** — thêm trap:
```bash
trap 'log "=== Backup THẤT BẠI ==="; \
  [ -n "${ADMIN_EMAIL:-}" ] && echo "Backup FAILED lúc $(date). Check log: $LOG_FILE" | \
  mail -s "[Saree ERP] ⚠️ Backup thất bại $(date +%Y-%m-%d)" "$ADMIN_EMAIL"' ERR
```

**Cài rclone + kết nối Google Drive** (làm 1 lần trên server):
```bash
curl https://rclone.org/install.sh | sudo bash
rclone config  # Chọn Google Drive, làm theo hướng dẫn interactive
# → tạo remote tên "gdrive"
```

### 2.2 Cài mailutils để gửi email notification

```bash
sudo apt install -y mailutils msmtp msmtp-mta
# Cấu hình msmtp với Gmail/SMTP của hệ thống
```

### 2.3 Setup crontab trên host server

```bash
# Backup prod mỗi ngày lúc 2:00 AM
0 2 * * * /opt/saree-erp/scripts/db_backup_full.sh >> /var/log/saree-backup.log 2>&1

# Backup UAT mỗi tuần (ít quan trọng hơn)
0 3 * * 0 /opt/saree-erp/scripts/db_backup_full_uat.sh >> /var/log/saree-backup.log 2>&1

# Cảnh báo disk full mỗi sáng 8:00 AM
0 8 * * * df -h / | awk 'NR==2{gsub(/%/,"",$5); if($5>80) print "[DISK WARNING] " $5"% used on server"}' | \
  mail -s "[Saree ERP] Disk Warning" "$ADMIN_EMAIL" 2>/dev/null || true
```

**Files cần tạo:** `scripts/db_backup_full.sh`, `scripts/setup_cron.sh`
**Files cần sửa:** `scripts/db_dump.sh` (thêm retention + log)

---

## Phase 3 — Hai môi trường UAT và Production

### Cấu trúc thư mục trên server

```
/opt/saree-erp/
├── uat/                         # UAT environment
│   ├── .env                     # UAT-specific env vars
│   └── (symlink hoặc copy project)
├── prod/                        # Production environment
│   ├── .env                     # Prod-specific env vars
│   └── (symlink hoặc copy project)
├── data/
│   ├── postgres-uat/            # UAT DB data
│   ├── postgres-prod/           # Prod DB data
│   ├── uploads-uat/
│   └── uploads-prod/
└── backups/
    ├── uat/
    └── prod/
```

### Tạo `compose.uat.yml` mới

Copy từ `compose.prod.yml`, sửa:
- `DOMAIN=uat.${CLIENT_DOMAIN}` → UAT chạy trên subdomain `uat.`
- `STACK_NAME=saree-uat`
- DB volume → `/opt/saree-erp/data/postgres-uat`
- Port nội bộ khác nhau (Traefik sẽ route theo domain, không cần đổi port)
- `ENVIRONMENT=staging`

### .env files

**`.env.uat`:**
```env
DOMAIN=uat.example.com
ENVIRONMENT=staging
STACK_NAME=saree-uat
POSTGRES_PASSWORD=<uat-password>
SECRET_KEY=<uat-secret>
FIRST_SUPERUSER=admin@saree-uat.local
```

**`.env.prod`:**
```env
DOMAIN=example.com
ENVIRONMENT=production
STACK_NAME=saree-prod
POSTGRES_PASSWORD=<prod-password>
SECRET_KEY=<prod-secret>
FIRST_SUPERUSER=admin@saree.com
```

### Chạy 2 stack song song

```bash
# Deploy UAT
cd /opt/saree-erp
docker compose --env-file .env.uat -f compose.uat.yml up -d

# Deploy Production
docker compose --env-file .env.prod -f compose.prod.yml up -d
```

Traefik sẽ tự route đúng domain cho từng stack.

**Files cần tạo:** `compose.uat.yml`, `.env.uat` (template), `.env.prod` (template)

---

## Phase 4 — HTTPS, SSL, Bảo mật (Nginx/Traefik)

### SSL đã có sẵn qua Traefik + Let's Encrypt

`compose.traefik.yml` đã cấu hình đầy đủ:
- Let's Encrypt TLS Challenge tự động cấp và gia hạn cert
- HTTP → HTTPS redirect tự động
- Cert lưu tại named volume `traefik-public-certificates` (persist qua restart)

**Chỉ cần đảm bảo:**
1. DNS A records trỏ về IP server trước khi deploy
2. Port 80 và 443 mở trên firewall server
3. Biến `EMAIL` hợp lệ (Let's Encrypt gửi cảnh báo expiry về đây)

### Bổ sung bảo mật vào `compose.prod.yml`

**Rate limiting** — thêm middleware Traefik:
```yaml
# Trong labels của backend service:
- "traefik.http.middlewares.api-ratelimit.ratelimit.average=100"
- "traefik.http.middlewares.api-ratelimit.ratelimit.burst=50"
- "traefik.http.routers.backend.middlewares=api-ratelimit"
```

**Security headers** — thêm middleware:
```yaml
- "traefik.http.middlewares.security-headers.headers.stsSeconds=31536000"
- "traefik.http.middlewares.security-headers.headers.stsIncludeSubdomains=true"
- "traefik.http.middlewares.security-headers.headers.contentTypeNosniff=true"
- "traefik.http.middlewares.security-headers.headers.browserXssFilter=true"
```

**Ẩn Adminer** (không expose database admin ra internet):
```yaml
# compose.prod.yml: xóa hoặc comment out service adminer
# Chỉ giữ nếu thực sự cần, và thêm BasicAuth:
- "traefik.http.middlewares.adminer-auth.basicauth.users=${ADMINER_USER}:${ADMINER_HASHED_PASSWORD}"
```

**Resource limits** (để không ăn hết RAM 12GB):
```yaml
# Trong mỗi service trong compose.prod.yml:
deploy:
  resources:
    limits:
      memory: 512M      # backend
      memory: 256M      # redis
      memory: 1G        # postgres
      memory: 128M      # frontend
```

**Files cần sửa:** `compose.prod.yml`, `compose.traefik.yml`

---

## Phase 5 — Resource Planning (Xeon + 12GB RAM)

### Ước tính RAM usage

| Service | UAT | Production |
|---------|-----|-----------|
| PostgreSQL | ~300MB | ~500MB |
| Redis | ~50MB | ~100MB |
| Backend (FastAPI) | ~150MB | ~250MB |
| Celery Worker | ~100MB | ~150MB |
| Celery Beat | ~80MB | ~80MB |
| Frontend (Nginx) | ~30MB | ~30MB |
| Traefik | ~50MB | ~50MB |
| **Total** | **~760MB** | **~1.16GB** |

**Tổng cả 2 stack: ~2GB** → Còn dư ~10GB cho OS và headroom. Ổn.

---

## Phase 6 — Checklist Deploy Đầy Đủ

### Trước khi deploy lần đầu (server setup — Ubuntu Server 22.04)

```bash
# 1. Cài Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Cài rclone (cho backup Google Drive)
curl https://rclone.org/install.sh | sudo bash
rclone config  # Setup Google Drive remote tên "gdrive"

# 3. Cài mailutils (cho email notification)
sudo apt install -y mailutils msmtp msmtp-mta

# 4. Tạo thư mục data
sudo mkdir -p /opt/saree-erp/{data/postgres-uat,data/postgres-prod,data/uploads-uat,data/uploads-prod,backups/uat,backups/prod}
sudo chown -R $USER:$USER /opt/saree-erp

# 5. Clone project
cd /opt/saree-erp
git clone <repo-url> .

# 6. Tạo Traefik network
docker network create traefik-public

# 7. Mở firewall
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable

# 8. Deploy Traefik (1 lần duy nhất)
DOMAIN=example.com EMAIL=admin@example.com \
  USERNAME=traefik HASHED_PASSWORD=$(openssl passwd -apr1 'yourpassword') \
  docker compose -f compose.traefik.yml up -d

# 9. Setup cron backup
chmod +x scripts/db_backup_full.sh
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/saree-erp/scripts/db_backup_full.sh") | crontab -
```

### Deploy UAT

```bash
cp .env.uat.template .env.uat
# Điền các giá trị vào .env.uat
docker compose --env-file .env.uat -f compose.uat.yml up -d --build
```

### Deploy Production

```bash
cp .env.prod.template .env.prod
# Điền các giá trị vào .env.prod
docker compose --env-file .env.prod -f compose.prod.yml up -d --build
```

### DNS Records cần tạo

```
# UAT
uat.example.com          A    <server-ip>
api.uat.example.com      A    <server-ip>

# Production
example.com              A    <server-ip>
api.example.com          A    <server-ip>
traefik.example.com      A    <server-ip>
```

---

## Phase 7 — Những Điều Cần Lưu Ý Thêm

### Bảo mật
- **Đổi tất cả default passwords** trong `.env` trước khi deploy
- **Không commit `.env.prod`** vào git (đã có trong `.gitignore`)
- **SSH key only** cho server, tắt password login: `PasswordAuthentication no` trong `/etc/ssh/sshd_config`
- **Fail2ban** để block brute force SSH: `apt install fail2ban`
- **Disable Adminer** trên production (lỗ hổng nghiêm trọng nếu để public)

### Monitoring tối giản (không cần stack phức tạp)
- Check uptime: dùng [UptimeRobot](https://uptimerobot.com) free tier — ping `/api/v1/utils/health-check/` mỗi 5 phút, email khi down
- `docker stats` để xem RAM/CPU real-time
- Cấu hình `SENTRY_DSN` trong `.env` để bắt lỗi backend tự động (Sentry có free tier)

### Logging
- `docker compose logs -f --tail=100 backend` để xem log real-time
- Logs tự rotate qua Docker log driver (mặc định). Thêm vào compose để giới hạn size:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "50m"
    max-file: "5"
```

### Update / Redeploy
```bash
git pull
docker compose --env-file .env.prod -f compose.prod.yml up -d --build
# Zero downtime nếu chỉ update backend/frontend
# Migrations chạy tự động qua prestart service
```

### Rollback
```bash
# Nếu update lỗi:
git checkout <previous-tag>
docker compose --env-file .env.prod -f compose.prod.yml up -d --build
# Restore DB nếu cần:
./scripts/db_restore.sh /opt/saree-erp/backups/prod/latest.dump .env.prod
```

---

## Chi phí tóm tắt

| Hạng mục | Chi phí | Ghi chú |
|----------|---------|---------|
| Domain | ~200-300k/năm | Matbao/PA Vietnam |
| SSL Certificate | **Miễn phí** | Let's Encrypt qua Traefik |
| Traefik (reverse proxy) | **Miễn phí** | Open source |
| Google Drive backup | **Miễn phí** | 15GB free tier đủ dùng |
| Monitoring (UptimeRobot) | **Miễn phí** | Free tier 50 monitors |
| Sentry (error tracking) | **Miễn phí** | Free tier đủ cho 30 users |

---

## Files cần tạo/sửa (tổng hợp)

```
Tạo mới:
├── compose.uat.yml                  # UAT environment compose
├── .env.uat.template                # UAT env template (commit được)
├── .env.prod.template               # Prod env template (commit được)
└── scripts/
    ├── setup_server.sh              # Script setup server 1 lần
    └── setup_cron.sh               # Script setup crontab

Sửa:
├── compose.prod.yml                 # Thêm resource limits, rate limit, security headers, bind mounts
├── scripts/db_dump.sh               # Thêm retention + notification
└── docs/deployment.md               # Cập nhật hướng dẫn đầy đủ cho 2 env
```

## Verification

1. Deploy Traefik → truy cập `https://traefik.example.com` thấy dashboard
2. Deploy UAT → truy cập `https://uat.example.com` thấy app, cert xanh
3. Deploy Production → truy cập `https://example.com` thấy app
4. Tắt/bật container: `docker compose down && docker compose up -d` → DB không mất dữ liệu
5. Chạy tay `./scripts/db_dump.sh` → thấy file `.dump` trong `/opt/saree-erp/backups/prod/`
6. 2:00 AM hôm sau → kiểm tra `/var/log/saree-backup.log` có entry mới

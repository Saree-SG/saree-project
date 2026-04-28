#!/usr/bin/env bash
#
# Tạo bản backup PostgreSQL (định dạng custom, pg_restore) từ container service `db`.
# Chạy tại thư mục gốc repo (nơi có compose.yml), hoặc chỉnh COMPOSE_FILE.
# Tổng quan compose: DOCKER_COMPOSE.md — có thể dùng ./scripts/docker.sh dev up -d trước khi dump.
#
# Ví dụ:
#   ./scripts/db_dump.sh
#   ./scripts/db_dump.sh ./backups
#   COMPOSE_FILE=compose.yml POSTGRES_USER=saree POSTGRES_DB=saree-erp-project ./scripts/db_dump.sh
#

set -euo pipefail

# Gán mặc định user/db khớp compose.yml nếu chưa đặt qua môi trường.
load_defaults_from_compose_yml() {
  if [[ -z "${POSTGRES_USER:-}" ]]; then
    POSTGRES_USER="saree"
  fi
  if [[ -z "${POSTGRES_DB:-}" ]]; then
    POSTGRES_DB="saree-erp-project"
  fi
}

# Xuất CSDL ra stdout (định dạng -Fc) từ trong container db.
run_pg_dump_inside_db_container() {
  docker compose -f "${COMPOSE_FILE}" exec -T db \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc -Z 6
}

# Ghi luồng pg_dump ra file .dump dưới thư mục chỉ định.
write_dump_to_host_file() {
  local out_dir="$1"
  local stamp
  stamp="$(date +%Y%m%d_%H%M%S)"
  local safe_db
  safe_db="${POSTGRES_DB//[^a-zA-Z0-9_-]/_}"
  mkdir -p "${out_dir}"
  local out_file="${out_dir%/}/${safe_db}_${stamp}.dump"
  run_pg_dump_inside_db_container >"${out_file}"
  echo "Đã ghi: ${out_file}"
}

# Điểm vào: đọc COMPOSE_FILE, dump ra backups hoặc thư mục tham số 1.
main() {
  local out_dir="${1:-./backups}"
  COMPOSE_FILE="${COMPOSE_FILE:-compose.yml}"
  load_defaults_from_compose_yml
  write_dump_to_host_file "${out_dir}"
}

main "$@"

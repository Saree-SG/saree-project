#!/usr/bin/env bash
#
# Khôi phục backup (.dump từ pg_dump -Fc) vào PostgreSQL trong container service `db`.
# Chạy trên máy có Docker và file compose của server (vd: compose.prod.yml), sau khi đã copy file .dump lên máy đó.
# Tổng quan compose: DOCKER_COMPOSE.md — khởi db: ./scripts/docker.sh prod up -d db
#
# Biến POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD lấy từ môi trường hoặc file .env (tham số 2 hoặc ENV_FILE).
# Tránh lệ thuộc owner/ACL trên server khác: dùng --no-owner --no-acl.
#
# Ví dụ (trên server, thư mục có compose.prod.yml và .env):
#   ./scripts/db_restore.sh ./backups/saree-erp-project_20260419_120000.dump
#   COMPOSE_FILE=compose.prod.yml ./scripts/db_restore.sh /path/to/backup.dump /path/to/.env
#
# Cảnh báo: --clean --if-exists sẽ xóa object trùng trước khi import (ghi đè schema + dữ liệu).
# pg_restore thường trả mã 1 khi chỉ có cảnh báo; mã >1 là lỗi nghiêm trọng.
#

set -euo pipefail

# In hướng dẫn ngắn rồi thoát mã 1.
usage_and_exit() {
  echo "Cách dùng: $0 <file.dump> [ENV_FILE]" >&2
  echo "  ENV_FILE mặc định: .env hoặc giá trị ENV_FILE (đọc khi thiếu biến Postgres)." >&2
  exit 1
}

# Nạp POSTGRES_* từ file dotenv (bash source).
load_postgres_env_from_dotenv() {
  local env_path="$1"
  if [[ ! -f "${env_path}" ]]; then
    echo "Không tìm thấy ${env_path}" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "${env_path}"
  set +a
}

# Kiểm tra đủ user, db, password trước khi restore.
require_postgres_vars() {
  if [[ -z "${POSTGRES_USER:-}" || -z "${POSTGRES_DB:-}" || -z "${POSTGRES_PASSWORD:-}" ]]; then
    echo "Thiếu POSTGRES_USER, POSTGRES_DB hoặc POSTGRES_PASSWORD." >&2
    echo "Đặt biến môi trường hoặc truyền file .env làm tham số thứ hai." >&2
    exit 1
  fi
}

# Sao chép file dump vào container để pg_restore đọc.
copy_dump_into_container() {
  local dump_file="$1"
  docker compose -f "${COMPOSE_FILE}" cp "${dump_file}" "db:/tmp/pg_restore.dump"
}

# Chạy pg_restore trong container db; trả về mã thoát của pg_restore.
run_pg_restore_in_container() {
  docker compose -f "${COMPOSE_FILE}" exec -T \
    -e "PGPASSWORD=${POSTGRES_PASSWORD}" \
    db \
    pg_restore \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    /tmp/pg_restore.dump
}

# Xóa file tạm trong container.
remove_dump_from_container() {
  docker compose -f "${COMPOSE_FILE}" exec -T db rm -f /tmp/pg_restore.dump
}

# Điểm vào: copy dump, restore, dọn file; chấp nhận mã thoát 0 hoặc 1 từ pg_restore.
main() {
  if [[ $# -lt 1 ]]; then
    usage_and_exit
  fi
  local dump_file="$1"
  local env_file="${2:-${ENV_FILE:-.env}}"
  COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yml}"

  if [[ ! -f "${dump_file}" ]]; then
    echo "Không tìm thấy file: ${dump_file}" >&2
    exit 1
  fi

  if [[ -z "${POSTGRES_USER:-}" || -z "${POSTGRES_DB:-}" || -z "${POSTGRES_PASSWORD:-}" ]]; then
    load_postgres_env_from_dotenv "${env_file}"
  fi
  require_postgres_vars

  copy_dump_into_container "${dump_file}"
  set +e
  run_pg_restore_in_container
  local rc=$?
  set -e
  remove_dump_from_container

  if [[ "${rc}" -eq 0 ]]; then
    echo "pg_restore hoàn tất (không báo lỗi)."
  elif [[ "${rc}" -eq 1 ]]; then
    echo "pg_restore kết thúc với mã 1 (thường là cảnh báo). Kiểm tra log phía trên."
  else
    echo "pg_restore thất bại (mã ${rc})." >&2
    exit "${rc}"
  fi
}

main "$@"

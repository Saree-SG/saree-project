#!/usr/bin/env bash
#
# Chạy docker compose đúng stack: dev (mặc định + override), prod, hoặc traefik.
# Luôn gọi từ thư mục gốc repo (nơi có các file compose).
#
# Ví dụ:
#   ./scripts/docker.sh dev up --build
#   ./scripts/docker.sh dev watch
#   ./scripts/docker.sh prod logs -f backend
#   ./scripts/docker.sh traefik up -d
#

set -euo pipefail

# In hướng dẫn và thoát mã 1.
print_usage_and_exit() {
  echo "Cách dùng: $0 <dev|prod|traefik> [tham số docker compose ...]" >&2
  echo "  dev     — compose.yml + compose.override.yml (mặc định của Docker)" >&2
  echo "  prod    — compose.prod.yml" >&2
  echo "  traefik — compose.traefik.yml" >&2
  exit 1
}

# Gọi docker compose với file compose phù hợp stack; các tham số còn lại chuyển nguyên cho docker compose.
run_docker_compose_for_stack() {
  local stack="$1"
  shift
  case "${stack}" in
    dev)
      docker compose "$@"
      ;;
    prod)
      docker compose -f compose.prod.yml "$@"
      ;;
    traefik)
      docker compose -f compose.traefik.yml "$@"
      ;;
    *)
      echo "Stack không hợp lệ: ${stack}" >&2
      print_usage_and_exit
      ;;
  esac
}

# Điểm vào: bắt buộc stack + ít nhất một tham số cho docker compose (vd: up, logs).
main() {
  if [[ $# -lt 2 ]]; then
    print_usage_and_exit
  fi
  local stack="$1"
  shift
  run_docker_compose_for_stack "${stack}" "$@"
}

main "$@"

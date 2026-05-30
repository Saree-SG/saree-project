# Hướng dẫn Setup Test Database

## Mục đích
Chạy toàn bộ test case trên DB riêng biệt, không ảnh hưởng DB production (`saree-erp-project`).

---

## 1. Tạo database test

```bash
# Kết nối PostgreSQL
psql -U saree -h localhost -p 5432

# Tạo DB test
CREATE DATABASE "saree-erp-test";
\q
```

---

## 2. Tạo file `.env.test` trong thư mục `backend/`

```env
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_DB=saree-erp-test
POSTGRES_USER=saree
POSTGRES_PASSWORD=2nl2ull7
SECRET_KEY=test-secret-key-not-for-production
FIRST_SUPERUSER=admin@test.com
FIRST_SUPERUSER_PASSWORD=Admin@123456
```

---

## 3. Chạy migration lên DB test

```bash
cd backend

# Export biến môi trường từ file test
export $(cat .env.test | xargs)

# Chạy alembic migrate
alembic upgrade head
```

Hoặc dùng script:

```bash
cd backend
POSTGRES_DB=saree-erp-test alembic upgrade head
```

---

## 4. Seed dữ liệu test ban đầu

```bash
cd backend

# Chạy seed với DB test
POSTGRES_DB=saree-erp-test python -m app.scripts.seed_defaults
```

Script seed tạo:
- Superuser: `admin@test.com` / `Admin@123456`
- Các vai trò mặc định: Director, Sales Manager, Project Manager, Technician, Accountant
- Quyền mặc định cho từng vai trò

---

## 5. Chạy backend với DB test (port riêng)

```bash
cd backend

# Chạy server test trên port 8001
POSTGRES_DB=saree-erp-test uvicorn app.main:app --port 8001 --reload
```

Frontend: đổi `VITE_API_URL=http://localhost:8001` khi test.

---

## 6. Reset DB test (khi cần bắt đầu lại)

```bash
psql -U saree -h localhost -p 5432 -c "DROP DATABASE \"saree-erp-test\";"
psql -U saree -h localhost -p 5432 -c "CREATE DATABASE \"saree-erp-test\";"
POSTGRES_DB=saree-erp-test alembic upgrade head
POSTGRES_DB=saree-erp-test python -m app.scripts.seed_defaults
```

---

## 7. Tài khoản test mặc định

| Email | Password | Vai trò |
|-------|----------|---------|
| admin@test.com | Admin@123456 | Superuser |
| director@test.com | Test@123456 | Director |
| sales@test.com | Test@123456 | Sales Manager |
| pm@test.com | Test@123456 | Project Manager |
| tech@test.com | Test@123456 | Technician |
| accountant@test.com | Test@123456 | Accountant |

> Tạo thủ công qua API sau khi seed, hoặc thêm vào script seed_defaults.

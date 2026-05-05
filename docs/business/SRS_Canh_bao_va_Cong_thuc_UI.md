# SRS - Co che canh bao, cong thuc tinh va hien thi UI

## 1. Muc tieu

Tai lieu nay mo ta ro:

- He thong canh bao nao dang co.
- Cong thuc/logic tinh canh bao.
- Cach hien thi tren UI de nguoi dung hieu va xu ly nhanh.

Pham vi hien tai gom 3 nhom:

- Canh bao rui ro tre tien do du an (4 lop phan tich).
- Canh bao task tre han / sap toi han.
- Canh bao ton kho thap.

## 2. Canh bao rui ro tre tien do du an (4 lop)

### 2.1 Muc tieu nghiep vu

Phat hien som nguy co tre tien do truoc khi du an bi truot deadline.

### 2.2 Dau vao du lieu

- Deadline du an.
- Danh sach task trong du an.
- Quan he phu thuoc giua cac task (FS).
- Tong tien do da bao cao cua tung task.
- Trang thai task (done/in_progress/review...).

### 2.3 Cong thuc va logic theo tung lop

#### Lop 1 - RED - Tre duong gang (Critical Path Impact)

**Dieu kien kich hoat:**

- Task chua hoan thanh.
- Task nam tren duong gang.
- `now > task.end_time`.

**Y nghia:**

- Day la canh bao nghiem trong nhat vi task duong gang tre se day lui moc ket thuc du an.

**Uoc tinh hien thi:**

- `delay_days = so ngay tre`.
- Du bao ngay ket thuc moi cua du an = `project_end + delay_days`.

#### Lop 2 - ORANGE - Hao hut thoi gian dem (Slack Consumption)

**Dieu kien kich hoat:**

- Task chua hoan thanh.
- Task co float/slack > 0.
- Da qua moc ket thuc ke hoach cua task.
- Ty le tieu hao dem >= 90%.

**Cong thuc:**

- `total_float = latest_finish - scheduled_finish`.
- `consumed = now - scheduled_finish`.
- `consumed_pct = consumed / total_float`.

Neu `consumed_pct >= 0.9` thi canh bao.

**Y nghia:**

- Chua tre du an ngay, nhung "dem an toan" sap het.

#### Lop 3 - YELLOW - Toc do tien do cham (Progress Velocity)

**Dieu kien kich hoat:**

- Da troi qua it nhat 30% thoi gian ke hoach cua task.
- Tien do thuc te thap hon 70% toc do ky vong.

**Cong thuc so sanh:**

- `elapsed_pct = (now - start_time) / (end_time - start_time)`.
- `expected_pct = elapsed_pct` (mo hinh tuyen tinh).
- `progress_pct = tong % tien do da bao cao`.

Canh bao khi: `progress_pct < expected_pct * 0.7`.

**Y nghia:**

- Task chay cham hon "nhip chuan", de dan den tre han.

#### Lop 4 - ORANGE - Nghen phu thuoc (Dependency Bottleneck)

**Dieu kien kich hoat:**

- Task chan (blocking task) chua xong.
- Task phu thuoc sap bat dau trong 3 ngay toi.

**Y nghia:**

- Neu task chan khong duoc xu ly ngay, task lien quan se dung day chuyen.

### 2.4 Cach hien thi tren UI

Tai man hinh du an:

- Header "Phan tich rui ro tre tien do".
- Badge tong so canh bao.
- Card cho tung canh bao gom:
  - Tieu de canh bao.
  - Noi dung chi tiet.
  - Nhan muc do: Nghiem trong / Canh bao / Chu y.
  - Nhan tang: Duong gang / Thoi gian dem / Toc do / Phu thuoc.
  - Neu co: "Tre ~N ngay".
  - Nut "Xem cong viec" de mo thang task.
- Co nut lam moi va moc thoi gian phan tich.

## 3. Canh bao task tre han va sap toi han

### 3.1 Muc tieu nghiep vu

Giup quan ly nhin ngay cac task can can thiep trong ngay.

### 3.2 Logic tinh

#### Task tre han

Task bi xem la tre han khi:

- `task.end_time < now`, va
- `task.status` khong phai `done` hoac `review`.

He thong phan loai:

- `overdue_critical`: anh huong tien do lon (duong gang/anh huong chuoi cha).
- `overdue_local`: tre cuc bo.

#### Task sap toi han

- `task.end_time <= now + 24h`.

### 3.3 Cach hien thi UI

Tren Dashboard:

- KPI card "Task tre" (mau do neu > 0).
- Bang "Canh bao - Task tre deadline" hien:
  - Task, trang thai, du an, phu trach, ngay bat dau, deadline, muc do.
  - Badge "Anh huong tien do" hoac "Cuc bo".

Tren man hinh chi tiet du an:

- So task tre trong card thong ke.
- Nut loc "Chi xem task dang tre".
- The task tre vien do + badge "Tre N ngay".
- Task sap toi han hien badge "Sap toi han".

## 4. Canh bao ton kho thap

### 4.1 Muc tieu nghiep vu

Canh bao som nguy co thieu vat tu de mua bo sung kip.

### 4.2 Logic tinh

Mot vat tu duoc dua vao danh sach canh bao khi:

- Co cau hinh nguong canh bao (`min_stock_alert > 0`), va
- Ton hien tai nho hon nguong (`current_stock < min_stock_alert`).

### 4.3 Cach hien thi UI

Tab "Ton kho":

- Cot ton kho doi mau do khi duoi nguong.
- Icon canh bao canh so ton.

Tab "Canh bao":

- Neu khong co du lieu: hien thong diep an toan.
- Neu co du lieu:
  - Bang canh bao (style mau do).
  - Cot "Thieu" tinh truc tiep:
    - `thieu = min_stock_alert - current_stock`.

## 5. Hanh dong de xuat cho nguoi dung khi thay canh bao

- RED (tre duong gang): uu tien hop nhanh, dieu chinh nguon luc trong ngay.
- ORANGE (slack/phu thuoc): xu ly trong 24h, tranh de thanh RED.
- YELLOW (toc do cham): yeu cau cap nhat tien do chi tiet, bo sung ho tro.
- Ton kho thap: tao yeu cau mua hoac dieu phoi kho noi bo.

## 6. Vi du de hieu (danh cho demo khach hang)

### Vi du 1 - Canh bao RED (duong gang)

- Du an A deadline: 30/04.
- Task "Lap dat tu dien tong" nam duong gang, han 25/04.
- Hom nay 27/04, task chua xong.

**He thong hien:**

- "Tre duong gang: Lap dat tu dien tong".
- "Cong viec tren duong gang da tre 2 ngay".
- Badge do "Nghiem trong", kem "Tre ~2 ngay".

**Nguoi dung can lam:**

- Dieu phoi them nhan su, uu tien xu ly task nay truoc.

### Vi du 2 - Canh bao ORANGE (hao hut dem)

- Task B khong nam duong gang, co 10 gio dem.
- Da qua han planned 9.5 gio.

**Tinh toan:**

- `consumed_pct = 9.5 / 10 = 95%`.

**He thong hien:**

- "Het thoi gian dem".
- "Da tieu thu 95% thoi gian dem".

**Nguoi dung can lam:**

- Chot nguon luc ngay trong ngay de tranh anh huong toan du an.

### Vi du 3 - Canh bao YELLOW (toc do cham)

- Task C ke hoach 10 ngay.
- Da troi 6 ngay -> `elapsed_pct = 60%`.
- Tien do bao cao moi 30% -> `progress_pct = 30%`.
- Nguong chap nhan: `expected * 70% = 60% * 70% = 42%`.

Vi `30% < 42%`, he thong canh bao cham tien do.

**He thong hien:**

- "Tien do cham: Task C".
- "Da qua 60% thoi gian, chi hoan thanh 30%".

### Vi du 4 - Canh bao ton kho thap

- Vat tu "Ong thep D60":
  - `min_stock_alert = 100`.
  - `current_stock = 72`.

**Tinh toan:**

- `thieu = 100 - 72 = 28`.

**He thong hien tren tab Canh bao:**

- Ten vat tu, ton hien tai 72, nguong 100, cot thieu hien 28.

**Nguoi dung can lam:**

- Tao yeu cau mua bo sung hoac dieu phoi tu kho khac.

---

Tai lieu nay dung cho muc dich gioi thieu co che canh bao voi khach hang, ket hop giua logic tinh toan va trai nghiem hien thi tren UI de de hieu, de demo.

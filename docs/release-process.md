# Phát hành bản mới — version & release notes

## Nguyên tắc: một nguồn duy nhất

Version hiển thị trong app lấy từ **entry mới nhất của `frontend/src/data/releaseNotes.ts`**, không phải `package.json`.

Lý do: release note là thứ **buộc phải sửa** mỗi lần phát hành (không có entry mới thì badge "Có gì mới" không hiện cho người dùng), nên nó không thể bị quên. Trước đây semver nằm ở `package.json` — một bước riêng, tách rời — và kết quả là header đứng ở `v1.0.0` suốt nhiều đợt deploy.

```
v1.1.0 (6ab36eb)
  │        └── git commit short hash — TỰ ĐỔI mỗi lần build, không phải sửa gì
  └── semver của entry đầu tiên trong releaseNotes.ts
```

## Phát hành: làm 3 việc

**1. Thêm entry lên ĐẦU mảng `RELEASE_NOTES`** trong `frontend/src/data/releaseNotes.ts`:

```ts
{
  version: "1.2.0",        // semver — xem quy ước bên dưới
  date: "15/08/2026",      // dd/MM/yyyy, chỉ để hiển thị
  title: "Tên ngắn của đợt cập nhật",
  items: [
    "Viết theo góc nhìn người dùng, không dùng từ kỹ thuật.",
    "Mỗi dòng một thay đổi họ thật sự thấy được.",
  ],
},
```

**2. Commit + deploy.** Không cần sửa `package.json`, không cần tạo git tag.

**3. Kiểm lại sau khi build:**

```bash
cd frontend && npx vite build
cat dist/version.json        # {"version":"1.2.0","build":"<hash>"}
```

Hoặc mở app xem góc trên phải header, và bấm icon loa để xem popup "Có gì mới".

## Quy ước semver

| Loại | Ví dụ | Khi nào |
|---|---|---|
| patch | `1.1.0` → `1.1.1` | Sửa lỗi, không đổi cách dùng |
| minor | `1.1.1` → `1.2.0` | Thêm tính năng, không phá cái cũ |
| major | `1.2.0` → `2.0.0` | Refactor lớn, hoặc thay đổi phá vỡ cách dùng cũ |

## Người dùng nhận bản mới thế nào

`useVersionCheck` poll `/version.json` mỗi 60 giây và **chỉ so `build`** (git hash), không quan tâm semver. Nên:

- Người dùng luôn được nhắc cập nhật sau mỗi lần deploy, kể cả khi bạn không đổi semver.
- Semver chỉ để **người đọc** hiểu đợt này thay đổi nhiều hay ít.
- Badge "chưa đọc" trên icon loa thì key theo `version`: nó hiện lại khi `version` của entry đầu tiên khác với `last_seen_release_version` đã lưu của người dùng.

## Vài chỗ dễ vướng

**Đổi `version` của entry đã phát hành sẽ bật lại badge.** Người dùng đã lưu `last_seen_release_version` bằng giá trị cũ; đổi tên entry làm popup hiện lại một lần cho tất cả. Không sao về mặt dữ liệu, nhưng đừng làm nếu không có lý do.

**`vite.config.ts` đọc file notes bằng regex**, vì file `.ts` không import trực tiếp vào config được:

```ts
const match = /version:\s*"([^"]+)"/.exec(src)
```

Nó bắt chuỗi có ngoặc kép **đầu tiên** trong file — khai báo `type ReleaseNote = { version: string ... }` phía trên không có ngoặc kép nên không bị trùng. Nếu ai đổi cấu trúc file notes (ví dụ tách entry ra file khác, hay đưa type xuống dưới) thì phải xem lại chỗ này. Có fallback về `package.json` nên build không bao giờ vỡ — nhưng version hiển thị sẽ sai âm thầm.

**`package.json` version giờ không dùng để hiển thị.** Nó vẫn ở `1.0.0` và không cần bump. Chỉ là fallback khi không đọc được file notes.

## File liên quan

| File | Vai trò |
|---|---|
| `frontend/src/data/releaseNotes.ts` | **Nguồn duy nhất** — nội dung + semver |
| `frontend/vite.config.ts` | Đọc semver, tính git hash, emit `version.json` |
| `frontend/src/utils/appVersion.ts` | Export `APP_VERSION` / `APP_BUILD` / `APP_VERSION_LABEL` |
| `frontend/src/hooks/useVersionCheck.ts` | Poll `version.json`, phát hiện bản mới |
| `frontend/src/components/Common/ReleaseNotesDialog.tsx` | Popup "Có gì mới" |
| `frontend/src/components/Common/ReleaseNotesBell.tsx` | Icon loa + badge chưa đọc |

# TASK-01: Xây Dựng Redis Playback State Service

> **Mục tiêu**: Quản lý trạng thái phát nhạc tức thời của phòng nghe nhạc trên Redis, áp dụng State Versioning tự tăng chống race condition, kiểm tra quyền hạn Host và lưu trữ với TTL 24 giờ.

---

## 1. File Tác Động
- **Tạo mới**: `apps/api/src/modules/playback/playback.service.ts`
- **Tạo mới**: `apps/api/src/modules/playback/playback.module.ts`
- **Cập nhật**: `apps/api/src/app.module.ts` (import PlaybackModule)

---

## 2. Yêu Cầu Kỹ Thuật Chi Tiết

1. **Redis Key Format**:
   - `room:{roomId}:playback`
   - Kiểu lưu trữ: chuỗi JSON (hoặc hash), có TTL 24 giờ (`86400` giây).
2. **Cấu Trúc State (`PlaybackState`)**:
   ```typescript
   export interface PlaybackState {
     roomId: string;
     trackId: string;
     isPlaying: boolean;
     positionMs: number;       // Vị trí tại thời điểm server ghi nhận
     serverTimestamp: number;  // Epoch ms của server (Date.now())
     version: number;          // Tăng dần: 1 -> 2 -> 3
     speed: number;            // Mặc định 1.0
   }
   ```
3. **Các Phương Thức Bắt Buộc Trong `PlaybackService`**:
   - `getPlaybackState(roomId: string): Promise<PlaybackState | null>`:
     - Lấy state từ Redis. Trả về `null` nếu phòng chưa phát nhạc.
   - `initOrUpdatePlaybackState(roomId: string, update: Partial<PlaybackState>): Promise<PlaybackState>`:
     - Đọc state hiện tại. Nếu chưa có, khởi tạo với `version = 1`.
     - Nếu đã có, tăng `version = current.version + 1`.
     - Cập nhật `serverTimestamp = Date.now()`.
     - Lưu lại Redis và gia hạn TTL 24h.
   - `verifyCanControlPlayback(roomId: string, userId: string): Promise<boolean>`:
     - Gọi `RoomsService.getRoomForUser(roomId, userId)`.
     - Kiểm tra nếu `room.settings.whoCanControlPlayback === 'host'`, chỉ cho phép nếu `room.hostId === userId`.
     - Nếu `whoCanControlPlayback === 'everyone'`, cho phép bất kỳ member nào.
     - Ném `ForbiddenException` kèm mã lỗi `ERROR_CODES.NOT_ROOM_HOST` nếu không đủ quyền.

---

## 3. Quy Chuẩn Bắt Buộc
- **Strict TypeScript 100%**: Tuyệt đối không dùng `any`, `@ts-ignore`.
- Không ghi vị trí phát mỗi giây vào MongoDB (chỉ lưu Redis theo quy định tại `.agents/rules/coding-standards.md`).
- Sử dụng `RedisService` có sẵn trong `apps/api/src/database/redis/redis.service.ts`.

---

## 4. Tiêu Chuẩn Hoàn Thành (Definition of Done)
- [ ] Chạy `pnpm --filter @soundwithme/api typecheck` không có lỗi.
- [ ] Module `PlaybackModule` được export sạch sẽ và nạp vào `AppModule`.
- [ ] Hàm `verifyCanControlPlayback` bảo vệ chặt chẽ quyền hạn điều khiển phòng.

# TASK-02: Xây Dựng Socket.IO Playback Gateway

> **Mục tiêu**: Xây dựng Gateway WebSocket xử lý các sự kiện phát nhạc theo thời gian thực (Play, Pause, Seek, Change Track, Sync Request), broadcast trạng thái đồng bộ tới tất cả thành viên trong phòng.

---

## 1. File Tác Động
- **Tạo mới**: `apps/api/src/realtime/gateways/playback.gateway.ts`
- **Cập nhật**: `apps/api/src/realtime/realtime.module.ts` (hoặc tạo mới module nếu chưa có)
- **Tham chiếu**: `packages/realtime-contracts/src/events.ts`

---

## 2. Yêu Cầu Kỹ Thuật Chi Tiết

1. **Namespace & Adapter**:
   - Sử dụng `WebSocketGateway({ cors: { origin: "*" }, namespace: "/" })`.
   - Kết nối với Redis Adapter đã cấu hình sẵn tại `apps/api/src/realtime/adapters/redis-io.adapter.ts`.
2. **Xác Thực Socket (Handshake Auth)**:
   - Trích xuất JWT token từ `client.handshake.auth.token` hoặc header `authorization`.
   - Xác thực người dùng, đính kèm `user` vào `client.data.user`. Nếu không hợp lệ, ngắt kết nối.
3. **Các Event Handlers Bắt Buộc**:
   - `@SubscribeMessage(SOCKET_EVENTS.ROOM_JOIN)`:
     - Thêm client socket vào room (`client.join(payload.roomId)`).
     - Lấy playback state hiện tại từ `PlaybackService.getPlaybackState(payload.roomId)`.
     - Nếu có state, gửi lại riêng cho client đó sự kiện `SOCKET_EVENTS.PLAYBACK_STATE`.
     - Broadcast cho toàn phòng `SOCKET_EVENTS.ROOM_JOIN` (`{ roomId, userId }`).
   - `@SubscribeMessage(SOCKET_EVENTS.PLAY)`:
     - Kiểm tra quyền: `await playbackService.verifyCanControlPlayback(roomId, userId)`.
     - Cập nhật state: `updateState(roomId, { isPlaying: true, positionMs: payload.positionMs })`.
     - Broadcast `server.to(roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, newState)`.
   - `@SubscribeMessage(SOCKET_EVENTS.PAUSE)`:
     - Kiểm tra quyền.
     - Cập nhật state: `updateState(roomId, { isPlaying: false, positionMs: payload.positionMs })`.
     - Broadcast `SOCKET_EVENTS.PLAYBACK_STATE`.
   - `@SubscribeMessage(SOCKET_EVENTS.SEEK)`:
     - Kiểm tra quyền.
     - Cập nhật state: `updateState(roomId, { positionMs: payload.positionMs })`.
     - Broadcast `SOCKET_EVENTS.PLAYBACK_STATE`.
   - `@SubscribeMessage(SOCKET_EVENTS.CHANGE_TRACK)`:
     - Kiểm tra quyền.
     - Cập nhật state: `updateState(roomId, { trackId: payload.trackId, positionMs: 0, isPlaying: true })`.
     - Broadcast `SOCKET_EVENTS.PLAYBACK_STATE`.
   - `@SubscribeMessage(SOCKET_EVENTS.SYNC_REQUEST)`:
     - Lấy state từ Redis, gửi riêng cho client gọi request.

---

## 3. Tiêu Chuẩn Hoàn Thành (Definition of Done)
- [ ] Tuân thủ hợp đồng sự kiện `SOCKET_EVENTS` từ `@soundwithme/constants`.
- [ ] Không có memory leak khi client ngắt kết nối (`handleDisconnect`).
- [ ] Mọi sự kiện broadcast đều chứa đầy đủ `version` và `serverTimestamp`.
- [ ] Chạy `pnpm typecheck` thành công 100%.

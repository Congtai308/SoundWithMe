# TASK-03: Xây Dựng Zustand Player Store & Audio Sync Engine

> **Mục tiêu**: Xây dựng tầng điều khiển Audio HTML5 trên Web Client bằng Zustand, kết hợp với Socket.IO để tự động triệt tiêu độ lệch âm thanh ($\Delta t \le 250\text{ms}$) theo đúng thuật toán State Versioning.

---

## 1. File Tác Động
- **Tạo mới**: `apps/web/src/features/player/stores/player-store.ts`
- **Tạo mới**: `apps/web/src/features/player/hooks/use-audio-sync.ts`
- **Tạo mới**: `apps/web/src/features/player/services/audio-engine.ts`

---

## 2. Yêu Cầu Kỹ Thuật Chi Tiết

1. **Zustand Store (`player-store.ts`)**:
   - Quản lý trạng thái Client:
     - `currentTrack: Track | null`
     - `isPlaying: boolean`
     - `currentPositionMs: number`
     - `durationMs: number`
     - `volume: number` (0 - 100)
     - `isMuted: boolean`
     - `isBuffering: boolean`
     - `stateVersion: number`
     - `isSyncedWithServer: boolean`
   - Actions: `setTrack`, `play`, `pause`, `seek`, `setVolume`, `toggleMute`, `applyServerState`.
2. **Thuật Toán Triệt Tiêu Độ Lệch (`use-audio-sync.ts`)**:
   - Lắng nghe sự kiện `SOCKET_EVENTS.PLAYBACK_STATE`:
     - **Lọc packet cũ**: `if (serverState.version <= currentStateVersion) return;`
     - **Tính vị trí mục tiêu**:
       ```typescript
       const targetMs = serverState.isPlaying
         ? serverState.positionMs + (Date.now() - serverState.serverTimestamp)
         : serverState.positionMs;
       ```
     - **So sánh độ lệch $\Delta t$**:
       ```typescript
       const deltaMs = Math.abs(audioElement.currentTime * 1000 - targetMs);
       if (deltaMs <= 100) {
         audioElement.playbackRate = 1.0; // In sync
       } else if (deltaMs <= 250) {
         // Điều chỉnh mềm mượt mà
         audioElement.playbackRate = audioElement.currentTime * 1000 < targetMs ? 1.02 : 0.98;
       } else {
         // Hard seek khi lệch quá 250ms
         audioElement.currentTime = targetMs / 1000;
         audioElement.playbackRate = 1.0;
       }
       ```
   - Xử lý trạng thái `play()` / `pause()` của thẻ `<audio>` theo `serverState.isPlaying`.

---

## 3. Tiêu Chuẩn Hoàn Thành (Definition of Done)
- [ ] Tuân thủ nghiêm ngặt: Server State nằm ở React Query, Player State nằm ở Zustand.
- [ ] Dọn dẹp sạch `eventListener` trong hàm cleanup của `useEffect` (chống memory leak).
- [ ] Không stream binary qua API NestJS; Audio source lấy trực tiếp từ CDN URL.
- [ ] Chạy `pnpm --filter @soundwithme/web typecheck` thành công 100%.

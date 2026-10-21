# TASK-04: Chuyển Đổi Giao Diện Phòng 3 Cột Theo Chuẩn Stitch UI

> **Mục tiêu**: Nâng cấp trang chi tiết phòng nghe nhạc `apps/web/app/(app)/room/[roomId]/page.tsx` từ dạng khung thô thành giao diện **Studio 3 Cột Obsidian Audio Atmosphere** theo đúng thiết kế từ Stitch (`docs/ui/stitch_soundwithme_social_music_platform/listening_room_3_column_stream_social_room/code.html`).

---

## 1. File Tác Động
- **Cập nhật chính**: `apps/web/app/(app)/room/[roomId]/page.tsx`
- **Tạo components bổ trợ trong feature rooms**:
  - `apps/web/src/features/rooms/components/RoomQueueSidebar.tsx` (Cột 1)
  - `apps/web/src/features/rooms/components/RoomMainStage.tsx` (Cột 2)
  - `apps/web/src/features/rooms/components/RoomChatSidebar.tsx` (Cột 3)
- **Tài liệu đối chiếu**: `docs/ui/stitch_soundwithme_social_music_platform/listening_room_3_column_stream_social_room/code.html`

---

## 2. Yêu Cầu Thiết Kế Chi Tiết (3 Cột Chuẩn Stitch)

1. **Cột 1: Shared Queue (`w-72` đến `w-80`)**:
   - Header: Tiêu đề Queue, số bài hát, nút `+ Add Song`.
   - Danh sách bài hát: Số thứ tự, thumbnail, tên bài hát, `Added by: [Tên thành viên]`.
   - **Bài hát đang phát (Active Card)**: Hiển thị nổi bật với nền `glass-card-active`, viền gradient tím/hồng, sóng âm equalizer chuyển động (`animate-equalizer`).
2. **Cột 2: Main Cinema Stage & Synced Lyrics (Trung tâm)**:
   - Khung hình 16:9 phát nhạc/video sắc nét, nhãn `● LIVE`.
   - Huy hiệu chất lượng: `Lossless 24-bit` & `● SYNCED`.
   - Thanh tiến độ phát nhạc gradient có con trỏ kéo tua.
   - Nút điều khiển: Prev, Nút tròn lớn Play/Pause gradient rực rỡ, Next, Volume slider, Loop toggle.
   - **Synced Lyrics Block**: Lời bài hát chạy đồng bộ, dòng đang phát phóng to nổi bật (`scale-105`, màu trắng sáng xanh ngọc), nút cân chỉnh lệch pha (`0.0s | -0.5s | +0.5s`).
3. **Cột 3: Listeners & Social Dock (`w-80` đến `w-88`)**:
   - Header: Số người nghe online (`● 11 online`).
   - Dải avatar tròn của các thành viên đang nghe chung (với viền Host).
   - Khung Live Chat: Danh sách tin nhắn cuộn mượt mà.
   - **Floating Reaction Bar**: Dải nút biểu cảm nhanh: ❤️ 🔥 😂 😭 💜 👏 🎵 (nhấn vào kích hoạt hiệu ứng).
   - Khung nhập tin nhắn hoặc nút `Sign in to chat`.

---

## 3. Tiêu Chuẩn Hoàn Thành (Definition of Done)
- [ ] Áp dụng đúng bảng màu Obsidian: nền tối sâu `#0B0C10`, viền `border-white/10`, hiệu ứng kính mờ `backdrop-blur-xl`.
- [ ] Đủ 4 trạng thái: Loading, Empty, Error, Offline theo `.agents/rules/coding-standards.md`.
- [ ] Kết nối trực tiếp với `useAudioSync` (từ Task-03) và `useRoom` (từ React Query).
- [ ] Chạy `pnpm --filter @soundwithme/web lint` và `typecheck` đạt 100%.

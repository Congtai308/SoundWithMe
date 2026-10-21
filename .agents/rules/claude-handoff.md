# Quy Chuẩn Giao Việc Claude Code CLI (Claude Code Handoff Protocol)

> **Mục tiêu tối thượng**: Tiết kiệm 90% chi phí Token, loại bỏ ảo giác (hallucinations), tăng tốc độ thực thi chính xác 100% theo các quy chuẩn đã đặt ra.

---

## 1. Nguyên Lý Vận Hành Cốt Lõi (Core Principles)

1. **Phạm vi hẹp tuyệt đối (Narrow Scoping)**:
   - Mỗi lệnh giao việc cho Claude Code CLI **chỉ được phép can thiệp tối đa 1 đến 2 file cụ thể**.
   - Tuyệt đối không giao lệnh mơ hồ kiểu: *"Hãy làm tính năng nghe nhạc"* hoặc *"Cải thiện toàn bộ project"*.
2. **Cô lập ngữ cảnh (Context Isolation)**:
   - Chỉ nạp đúng file cần chỉnh sửa và file hợp đồng liên quan (Interface/Zod Schema).
   - Dẫn chiếu trực tiếp đến các file quy chuẩn tại `.agents/rules/` để Claude Code tự động áp dụng luật mà không cần lặp lại prompt dài dòng.
3. **Chỉ nhận mã nguồn sạch (Zero Fluff)**:
   - Luôn yêu cầu Claude Code xuất thẳng code hoàn thiện, không giải thích dông dài, không viết code tóm tắt hoặc `// TODO`.

---

## 2. Cấu Trúc Lệnh CLI Chuẩn (One-Shot CLI Template)

```bash
claude -p "Đọc file <PATH_1> (và <PATH_2> nếu cần). Sửa <FUNCTION/COMPONENT/CLASS> để thực hiện <NHIỆM_VỤ_CHI_TIẾT>. Tuân thủ nghiêm ngặt các quy tắc tại .agents/rules/coding-standards.md và .agents/rules/tech-stack.md. Chỉ xuất mã nguồn hoàn thiện, không giải thích dài dòng, không dùng placeholder."
```

---

## 3. Mẫu Lệnh Cho Các Tác Vụ Điển Hình (Action-Specific Templates)

### 3.1. Tác Vụ 1: Tạo hoặc Cập Nhật Backend Service Method
```bash
claude -p "Đọc file apps/api/src/modules/rooms/rooms.service.ts và packages/types/src/room.ts. Viết hàm 'transferHost(roomId: string, currentHostId: string, newHostId: string): Promise<Room>' đảm bảo kiểm tra quyền host, cập nhật database, và ném lỗi chuẩn từ ERROR_CODES. Tuân thủ .agents/rules/coding-standards.md. Chỉ xuất code sạch."
```

### 3.2. Tác Vụ 2: Tạo Frontend Feature Component
```bash
claude -p "Đọc file apps/web/src/features/player/components/VolumeControl.tsx. Tạo component điều khiển âm lượng hỗ trợ slider và nút Mute, kết nối trực tiếp với Zustand store tại apps/web/src/features/player/stores/player-store.ts. Đảm bảo đủ 4 trạng thái và phím tắt bàn phím. Tuân thủ .agents/rules/coding-standards.md."
```

### 3.3. Tác Vụ 3: Thêm Schema Validation & TypeScript Type
```bash
claude -p "Đọc file packages/validation/src/room.ts. Thêm Zod schema 'transferHostSchema' nhận 'newHostId' dạng string cuid/uuid. Cập nhật export tương ứng trong packages/validation/src/index.ts. Tuân thủ .agents/rules/tech-stack.md."
```

### 3.4. Tác Vụ 4: Triển Khai Socket.IO Gateway Handler
```bash
claude -p "Đọc file apps/api/src/realtime/gateways/playback.gateway.ts và packages/realtime-contracts/src/events.ts. Viết handler cho sự kiện 'playback:seek' cập nhật state trong Redis kèm theo State Versioning tự tăng. Tuân thủ thuật toán trong .agents/rules/architecture.md. Chỉ xuất mã nguồn hoàn chỉnh."
```

### 3.5. Tác Vụ 5: Viết Unit Test Chặt Chẽ
```bash
claude -p "Đọc file apps/api/src/modules/auth/tokens.service.ts. Viết file test đơn vị apps/api/src/modules/auth/tokens.service.spec.ts kiểm thử toàn diện kịch bản xoay vòng Refresh Token hợp lệ và phát hiện Token bị tái sử dụng trái phép (Replay Attack). Sử dụng Jest mock Mongoose model. Tuân thủ .agents/rules/coding-standards.md."
```

---

## 4. Quy Trình Kiểm Thử Tự Động Sau Mỗi Handoff (Post-Handoff Verification)

Ngay sau khi Claude Code hoàn thành việc sửa mã nguồn, lập tức chạy chuỗi lệnh kiểm tra tự động để đảm bảo tính toàn vẹn:

```bash
# 1. Kiểm tra toàn bộ kiểu dữ liệu TypeScript (Bắt buộc 100% không lỗi)
pnpm typecheck

# 2. Kiểm tra linter và chuẩn format
pnpm lint

# 3. Chạy test liên quan đến module vừa can thiệp
pnpm test
```

> **Nguyên tắc đóng băng lỗi**: Nếu lệnh `pnpm typecheck` phát hiện bất kỳ lỗi nào, **dừng ngay lập tức** và dùng một lệnh Claude Code duy nhất để sửa lỗi kiểu đó trước khi chuyển sang tác vụ tiếp theo.

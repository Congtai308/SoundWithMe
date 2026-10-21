# Quy Trình Quản Lý Tác Vụ Claude Code CLI (.agents/tasks/)

Thư mục này chứa danh sách các **Tác vụ kỹ thuật độc lập (Scoped Tasks)** phục vụ giao việc trực tiếp cho Claude Code CLI.

---

## 1. Nguyên Tắc Giao Việc (Theo claude-handoff.md)
1. **Một lệnh — Một mục tiêu**: Mỗi task chỉ can thiệp tối đa 1 đến 2 file.
2. **Không giải thích dài dòng**: Yêu cầu Claude Code đọc file task, sửa file mã nguồn và chỉ xuất code hoàn thiện.
3. **Quy chuẩn bất biến**: Mọi task đều phải tuân thủ nghiêm ngặt 3 file quy chuẩn:
   - [`.agents/rules/tech-stack.md`](file:///d:/soundwithme/soundwithme/.agents/rules/tech-stack.md)
   - [`.agents/rules/coding-standards.md`](file:///d:/soundwithme/soundwithme/.agents/rules/coding-standards.md)
   - [`.agents/rules/architecture.md`](file:///d:/soundwithme/soundwithme/.agents/rules/architecture.md)

---

## 2. Hàng Đợi Tác Vụ Phase 1 MVP (Task Backlog)

| Mã Task | Tên tác vụ | Phạm vi file | Trạng thái |
| :--- | :--- | :--- | :---: |
| **[TASK-01](file:///d:/soundwithme/soundwithme/.agents/tasks/TASK-01-backend-playback-service.md)** | Xây dựng Redis Playback Service (State Versioning) | `apps/api/src/modules/playback/playback.service.ts` | 🟡 Sẵn sàng |
| **[TASK-02](file:///d:/soundwithme/soundwithme/.agents/tasks/TASK-02-backend-playback-gateway.md)** | Xây dựng Socket.IO Playback Gateway | `apps/api/src/realtime/gateways/playback.gateway.ts` | ⏳ Đợi Task-01 |
| **[TASK-03](file:///d:/soundwithme/soundwithme/.agents/tasks/TASK-03-frontend-player-sync-engine.md)** | Xây dựng Zustand Player Store & Audio Sync Hook | `apps/web/src/features/player/` | ⏳ Đợi Task-02 |
| **[TASK-04](file:///d:/soundwithme/soundwithme/.agents/tasks/TASK-04-frontend-3-column-room-ui.md)** | Chuyển đổi giao diện Phòng 3 cột theo chuẩn Stitch UI | `apps/web/app/(app)/room/[roomId]/page.tsx` | ⏳ Đợi Task-03 |

---

## 3. Cách Sử Dụng Lệnh One-Shot Cho Claude Code CLI

Khi đứng tại terminal gốc của dự án (`d:\soundwithme\soundwithme`), chạy lệnh:

```bash
claude -p "Đọc file .agents/tasks/TASK-01-backend-playback-service.md. Thực hiện đầy đủ yêu cầu trong task này. Tuân thủ các quy tắc tại .agents/rules/coding-standards.md. Chỉ xuất mã nguồn sạch, không placeholder, không giải thích dông dài."
```

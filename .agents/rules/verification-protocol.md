---
trigger: always_on
---

# SoundWithMe — Automated Verification & Git Approval Protocol

Tài liệu này là quy chuẩn bắt buộc đối với Agent (Gemini) trong việc nghiệm thu mã nguồn.

## Trigger Keywords (Từ khóa kích hoạt)
Mỗi khi User gửi tin nhắn chứa các từ khóa như:
- "kiểm tra"
- "nghiệm thu"
- "test code"
- "verify"
- "check task"

Agent (Gemini) BẮT BUỘC TỰ ĐỘNG thực hiện đầy đủ quy trình 5 bước sau mà không cần User phải nhắc lại:

### BƯỚC 1: Soi Code & Typecheck
1. Đọc `git diff` đối chiếu với `.agents/rules/coding-standards.md` (chắc chắn không có `any`, không circular dependency, tuân thủ đúng layer).
2. Chạy `pnpm typecheck` và `pnpm lint` toàn dự án để đảm bảo không có lỗi TypeScript hay cú pháp.

### BƯỚC 2: Test Backend & API Thực Tế (Dữ liệu thật)
1. Gửi request HTTP (curl hoặc PowerShell) trực tiếp vào các endpoint vừa được sửa hoặc tạo mới.
2. Kiểm tra mã trạng thái HTTP (200/201), định dạng JSON response và trạng thái trong database/Redis.

### BƯỚC 3: Tự động Viết & Chạy Unit / Integration Test
1. Nếu tính năng vừa làm chưa có file test, tự động viết bổ sung file test (`*.spec.ts`).
2. Chạy lệnh test qua terminal (`pnpm test`) và đảm bảo 100% test cases đều PASS (xanh).

### BƯỚC 4: Mở Trình Duyệt Test Giao Diện UI (Chrome DevTools)
1. Sử dụng Chrome DevTools / Browser truy cập vào `http://localhost:3000` dẫn tới màn hình vừa sửa.
2. Thao tác thử các nút bấm/form và bắt log Console của trình duyệt (đảm bảo 0 runtime errors).

### BƯỚC 5: Cổng Kiểm Duyệt Git (GIT APPROVAL GATE - BẮT BUỘC)
1. Xuất Báo cáo Nghiệm thu tổng hợp kèm kết quả của cả 3 cấp độ test trên.
2. Đề xuất sẵn một Commit Message chuẩn (theo format Conventional Commits, ví dụ: `feat(rooms): add member status check`).
3. ⛔ DỪNG LẠI TẠI ĐÂY - TUYỆT ĐỐI CẤM TỰ Ý COMMIT HAY PUSH GIT.
4. Đặt câu hỏi chờ User xác nhận: 
   "Tôi đã hoàn tất kiểm thử 3 cấp độ và toàn bộ kết quả đều xanh. Bạn có duyệt để tôi commit và push lên Git không?"
5. CHỈ KHI NÀO User gõ "Duyệt" / "Commit đi" / "OK" thì Agent mới được phép chạy lệnh `git commit` và `git push`.
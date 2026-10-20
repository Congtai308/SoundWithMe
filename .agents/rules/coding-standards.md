# Quy Chuẩn Lập Trình & Chất Lượng (Coding Standards & Production Guidelines)

> **Khẩu hiệu**: *Clean, Typed, Defensive, Resilient.*  
> Mọi dòng code commit vào SoundWithMe phải sẵn sàng chịu tải thực tế từ người dùng, không bao giờ chấp nhận code mang tính đối phó hay placeholder.

---

## 1. Kỷ Luật TypeScript (Strict TypeScript 100%)

1. **Tuyệt đối cấm `any`**: Sử dụng `unknown` kết hợp với Type Guards, Zod validation hoặc Generic Constraints khi chưa xác định được kiểu dữ liệu.
2. **Cấm `@ts-ignore` và `@ts-nocheck`**: Nếu gặp lỗi kiểu phức tạp, phải khai báo interface chính xác hoặc dùng Discriminated Unions.
3. **Khai báo kiểu tường minh (Explicit Return Types)**: Mọi hàm công khai (public methods trong Service, Controller, Helpers, Hooks) bắt buộc phải khai báo kiểu trả về.
4. **Single Source of Truth cho Types**:
   - Schema kiểm thực: Viết bằng **Zod** trong `packages/validation`.
   - Kiểu dữ liệu TypeScript: Suy diễn trực tiếp từ schema qua `z.infer<typeof schema>` hoặc định nghĩa trong `packages/types`.

---

## 2. Kiến Trúc Backend (Clean Architecture trong NestJS)

Mỗi module trong `apps/api/src/modules/` phải tuân thủ nghiêm ngặt mô hình 3 tầng:

```
Request ──> [Controller (Siêu mỏng)] ──> [Service (Domain Logic)] ──> [Mongoose Model / Redis (Data Layer)]
                     │
                     ▼
          ZodValidationPipe (DTO)
```

1. **Controller (Thin Controller)**:
   - Nhiệm vụ duy nhất: Định tuyến HTTP / WebSocket, gắn Guard xác thực, parse & validate payload qua `ZodValidationPipe`, gọi Service tương ứng và trả về chuẩn response `{ success: true, data }`.
   - **CẤM**: Không viết bất kỳ dòng logic nghiệp vụ, câu truy vấn database hay tính toán dữ liệu nào trong Controller.
2. **Service (Rich Domain Service)**:
   - Nơi tập trung toàn bộ Business Rules, kiểm tra quyền sở hữu phòng, tính toán version playback, xử lý failover.
   - Luôn sử dụng custom exception chuẩn từ `@nestjs/common` (`NotFoundException`, `ForbiddenException`, `ConflictException`) đi kèm mã lỗi `ERROR_CODES`.
3. **Data Layer (MongoDB Schemas & Redis Repositories)**:
   - Mọi schema Mongoose phải có index rõ ràng cho các trường tìm kiếm (`roomId`, `userId`, `email`).
   - Tách biệt rõ Model bền vững và thao tác Redis ngắn hạn.

---

## 3. Kiến Trúc Frontend (Feature-First Pattern)

Cấu trúc thư mục trong `apps/web/src/` được chia theo tính năng độc lập, **tuyệt đối cấm gom toàn bộ 300 components vào một thư mục gốc**:

```
apps/web/src/
├── features/
│   ├── auth/                   # Toàn bộ Auth (Form, Card, Hooks, Services)
│   ├── rooms/                  # Quản lý danh sách phòng, chi tiết phòng, modal tạo phòng
│   ├── player/                 # Bộ phát nhạc, thanh điều khiển, sync logic
│   ├── chat/                   # Hộp chat phòng, tin nhắn
│   └── music/                  # Tìm kiếm bài hát, hiển thị TrackRow, catalog
├── components/
│   ├── ui/                     # Primitive design components (Button, Input, Modal, Badge)
│   └── layout/                 # Khung sườn ứng dụng (AppShell, Sidebar, TopNav)
├── hooks/                      # Global shared hooks (useDebouncedValue, useEventListener)
├── providers/                  # React Query, Theme, Auth Providers
└── services/                   # API client axios/fetch base, Socket singleton client
```

* Mỗi feature bao gồm:
  - `components/`: Các component chỉ dùng riêng cho tính năng này.
  - `hooks/`: Custom hooks bọc logic truy vấn (`useQuery`, `useMutation`).
  - `services/`: Hàm gọi REST API tương ứng của feature.
  - `index.ts`: Public API của feature xuất ra cho các phần khác sử dụng.

---

## 4. Phân Định Trạng Thái Nghiêm Ngặt (State Separation Rule)

```
        ┌────────────────────────────────────────────────────────┐
        │                 DỮ LIỆU CỦA ỨNG DỤNG                   │
        └──────────────────────────┬─────────────────────────────┘
                                   │
         Phân loại ranh giới nguồn gốc dữ liệu (Source of Truth)
                                   │
            ┌──────────────────────┴──────────────────────┐
            ▼                                             ▼
  ┌───────────────────┐                         ┌───────────────────┐
  │   SERVER STATE    │                         │   CLIENT STATE    │
  │ (REST API Data)   │                         │ (UI & Realtime)   │
  └─────────┬─────────┘                         └─────────┬─────────┘
            │                                             │
            ▼                                             ▼
  ┌───────────────────┐                         ┌───────────────────┐
  │  TanStack Query   │                         │   Zustand Store   │
  │ (react-query v5)  │                         │                   │
  └───────────────────┘                         └───────────────────┘
   - Danh sách phòng                             - Trạng thái Modal (Open/Close)
   - Thông tin User/Profile                      - Vị trí phát audio hiện tại (ms)
   - Kết quả tìm kiếm nhạc                       - Trạng thái Buffer/Mute/Volume
   - Lịch sử phòng đã nghe                       - Kết nối Socket.IO đang mở/đóng
```

> **ĐIỀU CẤM KỴ**: Tuyệt đối KHÔNG copy dữ liệu từ TanStack Query để lưu vào Zustand. Server State chỉ thuộc về TanStack Query để tận dụng cơ chế invalidate, caching và deduplication tự động.

---

## 5. Quy Chuẩn Cơ Sở Dữ Liệu & Hiệu Năng (Database Performance Rules)

1. **Quy tắc Playback State**:
   - **TUYỆT ĐỐI CẤM** ghi vị trí phát nhạc (`currentPositionMs`) mỗi giây vào MongoDB.
   - Vị trí phát thời gian thực **chỉ lưu trên Redis** (`room:{roomId}:state`).
   - MongoDB **chỉ lưu** khi: Bắt đầu bài hát mới, Host đổi bài, Host kết thúc phòng, hoặc ghi nhận phiên nghe nhạc (`listeningSessions`) phục vụ thống kê.
2. **Bắt buộc Cursor Pagination**:
   - Mọi API danh sách (`GET /rooms`, `GET /search`, `GET /history`) bắt buộc dùng Cursor Pagination (`_id < cursor`, sắp xếp giảm dần theo `_id`).
   - Cấm dùng `skip(offset)` trên các bảng dữ liệu có thể tăng trưởng lớn vì gây quét full-index.
3. **Cấm Unbounded Arrays trong Documents**:
   - Không được nhúng danh sách tin nhắn chat vô tận hoặc lịch sử hành vi vào trong Document `Room` (sẽ vượt quá giới hạn 16MB của BSON).
   - Chat, Thành viên lịch sử phải được lưu thành Collection riêng biệt có liên kết khóa ngoại (`roomId`).

---

## 6. Tiêu Chuẩn Giao Diện & Trải Nghiệm (UI/UX Imperatives)

1. **Visual Tone**:
   - **Tông màu chủ đạo**: Dark mode sâu, hiện đại, tối giản nhưng ấm áp (`deep navy: #0B0E14`, `surface: #121824`, `border: #1E293B`).
   - **Màu điểm nhấn (Accent)**: Tím điện quang (`electric purple: #8B5CF6`) kết hợp hồng phát sóng (`accent-live: #EC4899`) tạo cảm giác phòng thu tương lai.
2. **Quy tắc 4 Trạng Thái Bắt Buộc (4 Mandatory States)**:
   Mọi trang và component hiển thị dữ liệu đều phải thiết kế đầy đủ 4 trạng thái:
   - **Loading State**: Hiển thị Skeleton hoặc Waveform loader nhấp nháy êm dịu, giữ nguyên khung sườn để không bị nhảy layout (CLS = 0).
   - **Empty State**: Không được để trống màn hình. Phải có icon minh họa, thông báo thân thiện và nút hành động (Call To Action).
   - **Error State**: Thông báo lỗi rõ ràng theo ngữ cảnh kèm nút bấm "Thử lại" (Retry).
   - **Offline / Reconnecting State**: Khi mất mạng hoặc socket đứt kết nối, hiển thị thanh cảnh báo mờ viền vàng/đỏ và tự động thử kết nối lại.

---

## 7. Danh Sách 20 Điều Cấm Kỵ Tuyệt Đối (The Never-Do List)

1. ❌ **Không drop, flush hoặc reset database** trong môi trường Production/Staging mà không có script backup và phê duyệt.
2. ❌ **Không bao giờ tắt hoặc bypass `JwtAuthGuard`** trên các endpoint yêu cầu quyền riêng tư.
3. ❌ **Không bỏ qua Zod validation pipe**; mọi dữ liệu từ client gửi lên đều được coi là không đáng tin cậy.
4. ❌ **Không trust quyền hạn do client gửi lên trong payload** (ví dụ: client gửi `{ role: "host" }`, server phải tự truy vấn DB để xác thực quyền host).
5. ❌ **Không stream audio nhị phân qua NestJS backend API** (phải qua CDN Range-Requests).
6. ❌ **Không ghi log chứa thông tin nhạy cảm** (mật khẩu gốc, JWT secret, refresh token thô, thẻ tín dụng).
7. ❌ **Không commit file `.env` chứa credential thật** lên git repository.
8. ❌ **Không sử dụng kiểu dữ liệu `any`**, `as any`, hoặc chú thích `@ts-ignore`.
9. ❌ **Không poll HTTP liên tục** (long-polling) để nhận cập nhật vị trí nhạc thay cho Socket.IO.
10. ❌ **Không lưu Server Cache hoặc REST payload vào Zustand Store**.
11. ❌ **Không dùng `skip(offset)`** để phân trang trên các bảng dữ liệu người dùng/phòng.
12. ❌ **Không lưu unbounded arrays** bên trong một MongoDB Document đơn lẻ.
13. ❌ **Không ghi dữ liệu vị trí phát nhạc (positionMs) mỗi giây vào MongoDB**.
14. ❌ **Không để client tự quyết định `serverTimestamp` hay `version`** của trạng thái phát nhạc.
15. ❌ **Không mutate trực tiếp biến state** trong React hoặc Zustand mà không qua các hàm setter được cung cấp.
16. ❌ **Không bỏ qua bất kỳ trạng thái nào trong 4 trạng thái**: Loading, Empty, Error, Offline.
17. ❌ **Không import chéo vòng tròn (Circular Dependency)** giữa các module NestJS hoặc giữa các package.
18. ❌ **Không tạo các file rỗng, mock giả tạo hoặc để lại `// TODO`** mà không có kế hoạch xử lý rõ ràng.
19. ❌ **Không nuốt lỗi âm thầm (swallow exceptions)** bằng các khối `try { ... } catch {}` rỗng.
20. ❌ **Không merge code khi chưa vượt qua kiểm tra**: `pnpm typecheck`, `pnpm lint` và bộ test tương ứng.

---

## 8. Tiêu Chuẩn Hoàn Thành (Definition of Done - DoD 12 Điểm)

Một tính năng chỉ được xem là hoàn thành (Done) khi đáp ứng toàn diện 12 tiêu chí sau:

- [ ] **1. Type Safety 100%**: Lệnh `pnpm typecheck` thành công trên toàn bộ monorepo, 0 lỗi kiểu, 0 `any`.
- [ ] **2. Lint & Clean Code**: Lệnh `pnpm lint` đạt điểm tuyệt đối, tuân thủ Prettier và ESLint config.
- [ ] **3. Schema Validation**: Mọi đầu vào (Query, Param, Body) đều được kiểm thực chặt chẽ qua Zod Schemas.
- [ ] **4. Error Handling**: Mọi lỗi đều trả về đúng định dạng chuẩn `{ success: false, error: { code, message } }`.
- [ ] **5. Authorization & Guards**: Kiểm tra đúng quyền hạn (Host, Member, Guest) cho từng hành động.
- [ ] **6. State Segregation**: Phân định chuẩn xác: REST API nằm ở React Query; Audio/UI state nằm ở Zustand.
- [ ] **7. UI 4-State Compliance**: Component có đủ giao diện Loading, Empty, Error và Reconnecting.
- [ ] **8. Responsive & Immersive UX**: Giao diện hiển thị sắc nét trên cả màn hình Desktop lẫn Mobile web, tương thích dark mode.
- [ ] **9. Realtime Synchronization**: Sự kiện Socket.IO phát đúng payload theo hợp đồng trong `@soundwithme/realtime-contracts`.
- [ ] **10. Memory Safety**: Các event listener (WebSocket, Audio element) đều được dọn dẹp sạch sẽ trong cleanup function của `useEffect`.
- [ ] **11. Efficient Database Queries**: Có đánh index cho các trường query MongoDB; không tồn tại truy vấn N+1.
- [ ] **12. Zero Placeholder**: Không còn code giả lập dạng text tĩnh, không còn comment `// TODO` chưa giải quyết.

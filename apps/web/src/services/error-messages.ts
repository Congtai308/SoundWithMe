/**
 * What people read when the API or a room socket refuses something. The
 * API's own messages are English and meant for developers; these follow
 * the error code. Codes not listed here keep the API's message.
 */
const MESSAGES: Record<string, string | ((details: Record<string, unknown>) => string)> = {
  UNAUTHENTICATED: "Bạn cần đăng nhập để làm việc này.",
  INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  INVALID_LINK: "Link này không dùng được nữa.",
  NOT_FOUND: "Không tìm thấy.",
  SESSION_EXPIRED: "Phiên đăng nhập đã hết hạn. Đăng nhập lại nhé.",
  REFRESH_TOKEN_INVALID: "Phiên đăng nhập đã hết hạn. Đăng nhập lại nhé.",
  REFRESH_TOKEN_REUSED: "Phiên đăng nhập đã hết hạn. Đăng nhập lại nhé.",
  GOOGLE_AUTH_FAILED: "Đăng nhập Google không thành công. Thử lại nhé.",
  ACCOUNT_HAS_NO_PASSWORD: "Tài khoản này đăng nhập bằng Google. Hãy dùng nút Tiếp tục với Google.",
  FORBIDDEN: "Bạn không có quyền làm việc này.",
  NOT_ROOM_MEMBER: "Bạn chưa ở trong phòng này.",
  NOT_ROOM_HOST: "Chỉ chủ phòng (hoặc DJ) được làm việc này.",
  BLOCKED_USER: "Bạn không thể tương tác với người này.",
  USER_NOT_FOUND: "Không tìm thấy người dùng.",
  USER_ALREADY_EXISTS: "Email này đã có tài khoản.",
  USERNAME_TAKEN: "Username này đã có người dùng.",
  ROOM_NOT_FOUND: "Không tìm thấy phòng.",
  ROOM_FULL: "Phòng đã đầy.",
  ROOM_CLOSED: "Phòng đã kết thúc.",
  ALREADY_ROOM_MEMBER: "Bạn đã ở trong phòng này rồi.",
  CANNOT_LEAVE_AS_HOST: "Chủ phòng không rời được — hãy kết thúc hoặc giao phòng.",
  ROOM_LIMIT_REACHED: (d) =>
    typeof d.roomName === "string"
      ? `Bạn đang làm chủ phòng “${d.roomName}”. Kết thúc phòng đó trước khi mở phòng mới.`
      : "Bạn đang làm chủ một phòng khác. Kết thúc phòng đó trước khi mở phòng mới.",
  ROOM_LOCKED: (d) =>
    d.hasPasscode ? "Phòng riêng tư. Mở link mời hoặc nhập mật mã." : "Phòng chỉ vào bằng link mời. Nhờ chủ phòng gửi link nhé.",
  ROOM_PASSCODE_INVALID: "Sai mật mã.",
  ROOM_FRIENDS_ONLY: "Chỉ bạn bè của chủ phòng được vào phòng này.",
  ROOM_BANNED: "Chủ phòng đã mời bạn ra khỏi phòng này.",
  HOST_TRANSFER_INVALID: "Không giao phòng được — người đó đang làm chủ một phòng khác.",
  DJ_LIMIT: "Phòng đã đủ số DJ tối đa.",
  TRACK_NOT_FOUND: "Không tìm thấy bài hát.",
  QUEUE_ITEM_NOT_FOUND: "Bài này không còn trong hàng chờ.",
  STALE_PLAYBACK_VERSION: "Nhạc vừa được người khác đổi. Thử lại nhé.",
  TRACK_NOT_PLAYABLE: "Bài này không phát được.",
  QUEUE_EMPTY: "Hàng chờ đang trống.",
  QUEUE_FULL: "Hàng chờ đã đầy.",
  MUSIC_PROVIDER_UNAVAILABLE: "Không kết nối được YouTube. Thử lại sau nhé.",
  MUSIC_PROVIDER_QUOTA_EXCEEDED: "Hôm nay đã hết lượt tìm kiếm. Dán link YouTube vẫn dùng được.",
  LYRICS_UNAVAILABLE: "Không tải được lời bài hát.",
  MIC_FULL: "Các mic đều đang có người hát.",
  CANNOT_FRIEND_SELF: "Bạn không thể tự kết bạn với mình.",
  ALREADY_FRIENDS: "Hai bạn đã là bạn bè.",
  FRIEND_REQUEST_EXISTS: "Đã có lời mời kết bạn giữa hai người.",
  FRIEND_REQUEST_NOT_FOUND: "Lời mời kết bạn không còn nữa.",
  FRIEND_LIMIT: "Danh sách bạn bè đã đầy.",
  NOT_FRIENDS: "Hai bạn chưa là bạn bè.",
  PLAYLIST_NOT_FOUND: "Không tìm thấy playlist.",
  LIBRARY_LIMIT: "Thư viện đã đầy.",
  CHAT_DISABLED: "Chủ phòng đã tắt chat.",
  CHAT_MUTED: "Chủ phòng đã tắt chat của bạn.",
  REACTIONS_DISABLED: "Chủ phòng đã tắt thả cảm xúc.",
  VALIDATION_ERROR: "Thông tin chưa hợp lệ, kiểm tra lại nhé.",
  RATE_LIMITED: "Bạn thao tác nhanh quá. Đợi một chút rồi thử lại nhé.",
  INTERNAL_ERROR: "Có lỗi xảy ra. Thử lại nhé.",
};

export function errorMessage(code: string, fallback: string, details: Record<string, unknown> = {}): string {
  const message = MESSAGES[code];
  if (message === undefined) return fallback;
  return typeof message === "function" ? message(details) : message;
}

# SoundWithMe — Project Architecture & Flow

## 1. Tổng quan

SoundWithMe là social music platform với trọng tâm:

> Music connects us wherever you are.

Core loop:

```text
Discover
   ↓
See someone listening
   ↓
Listen Together
   ↓
Create / Join Room
   ↓
Synchronized Playback
   ↓
Chat + Reactions
   ↓
Save / Share
   ↓
Discover again
```

---

# 2. Kiến trúc tổng thể

```text
                         ┌────────────────────┐
                         │      Next.js       │
                         │        Web         │
                         └─────────┬──────────┘
                                   │
                              REST / WS
                                   │
                         ┌─────────▼──────────┐
                         │       NestJS       │
                         │    Modular API     │
                         └───────┬───┬────────┘
                                 │   │
                    ┌────────────┘   └────────────┐
                    ↓                             ↓
              ┌───────────┐                 ┌───────────┐
              │  MongoDB  │                 │   Redis   │
              │  Atlas    │                 │           │
              └───────────┘                 └───────────┘
                    │                             │
              Persistent data              Realtime state
                                                  │
                                             Socket.IO
                                                  │
                              ┌───────────────────┴──────────────┐
                              ↓                                  ↓
                           Users                              Rooms
                           Chat                              Playback
                         Presence                           Reactions

                         AUDIO / MEDIA
                              │
                              ↓
                         R2 / S3
                              │
                              ↓
                             CDN
                              │
                              ↓
                        Audio Player
```

---

# 3. Vai trò từng công nghệ

| Thành phần | Vai trò |
|---|---|
| Next.js | Web UI, routing, rendering |
| NestJS | Business API, authorization, domain logic |
| MongoDB | Persistent application data |
| Redis | Cache + realtime/ephemeral state |
| Socket.IO | Real-time communication |
| R2/S3 | Audio/media storage |
| CDN | Phân phối audio/media |
| FFmpeg | Audio processing khi scale |
| HLS | Streaming adaptive ở phase sau |
| Expo | Mobile app tương lai |
| Turborepo | Monorepo |
| pnpm | Package management |
| Sentry | Error monitoring |
| PostHog | Product analytics |

---

# 4. Data flow cơ bản

## 4.1 User mở Home

```text
Browser
  ↓
Next.js
  ↓
TanStack Query
  ↓
NestJS
  ↓
MongoDB
  ↓
JSON response
  ↓
UI
```

Redis có thể được dùng để cache dữ liệu hot.

---

# 5. Music flow

```text
User searches "The Weeknd"
          ↓
Next.js
          ↓
NestJS /music/search
          ↓
Music Provider
          ↓
Normalize provider response
          ↓
Track model
          ↓
UI
```

SoundWithMe không nên phụ thuộc trực tiếp vào một provider.

Dùng:

```text
MusicProvider
├── search()
├── getTrack()
├── getArtist()
├── getAlbum()
└── getPlaybackCapabilities()
```

Provider có thể thay đổi trong tương lai.

**Lưu ý:** Chỉ lưu/phát nội dung mà SoundWithMe có quyền sử dụng theo licensing và provider terms.

---

# 6. Audio playback flow

## MVP

```text
MongoDB
   ↓
Track metadata
   ↓
NestJS
   ↓
Authorized playback URL
   ↓
CDN
   ↓
Browser Audio
```

Backend không proxy toàn bộ audio.

## Scale

```text
Original Audio
      ↓
    FFmpeg
      ↓
Multiple bitrates
      ↓
     HLS
      ↓
R2 / S3
      ↓
    CDN
      ↓
  Audio Player
```

---

# 7. Create Room flow

```text
User
 ↓
Create Room form
 ↓
POST /api/v1/rooms
 ↓
Auth guard
 ↓
Validation
 ↓
Room Service
 ↓
Room Repository
 ↓
MongoDB
 ↓
Room created
 ↓
Return room
 ↓
Navigate /room/:roomId
 ↓
Socket.IO JOIN_ROOM
 ↓
Redis presence
```

---

# 8. Join Room flow

```text
User
 ↓
Open room
 ↓
GET room metadata
 ↓
Check room visibility
 ↓
Check permission
 ↓
Join API
 ↓
Socket.IO room join
 ↓
Redis presence
 ↓
Broadcast ROOM_JOIN
 ↓
Existing users see new participant
```

---

# 9. Room realtime flow

```text
                    ROOM
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
        Alex        Emma       Ryan
          │          │          │
          └──────────┼──────────┘
                     │
                 Socket.IO
                     │
                 NestJS
                     │
              ┌──────┴──────┐
              ↓             ↓
            Redis        MongoDB
         temporary       persistent
```

Redis giữ state ngắn hạn.
MongoDB lưu dữ liệu cần tồn tại lâu dài.

---

# 10. Playback synchronization

Đây là core technical flow.

Host:

```text
PLAY at 42.3 sec
```

Client gửi:

```text
PLAY
{
  trackId,
  positionMs
}
```

Server:

```text
Validate user
      ↓
Check host permission
      ↓
Update authoritative state
      ↓
Increment state version
      ↓
Save state in Redis
      ↓
Broadcast PLAYBACK_STATE
```

State:

```text
{
  trackId: "...",
  isPlaying: true,
  positionMs: 42300,
  serverTimestamp: 123456789,
  version: 42
}
```

Participant:

```text
Receive state
      ↓
Calculate elapsed time
      ↓
Calculate current position
      ↓
Update local audio player
```

Công thức ý tưởng:

```text
currentPosition =
positionMs +
(now - serverTimestamp)
```

khi `isPlaying = true`.

Khi pause:

```text
currentPosition = positionMs
```

---

# 11. Vì sao không update MongoDB mỗi giây?

Không làm:

```text
00:01 → UPDATE
00:02 → UPDATE
00:03 → UPDATE
00:04 → UPDATE
...
```

Vì hàng nghìn người dùng sẽ tạo lượng write rất lớn.

Thay vào đó:

```text
Redis
  ↓
Realtime playback state
```

Chỉ persist những event quan trọng:
- room started
- track changed
- session ended
- meaningful state changes

---

# 12. Race condition trong playback

Ví dụ:

```text
Host PLAY
Host PAUSE
Host NEXT
```

Các event có thể đến gần nhau.

Giải pháp:

```text
Playback state version

40 → PLAY
41 → PAUSE
42 → NEXT
```

Client bỏ qua event có version cũ.

Server là source of truth.

---

# 13. Queue flow

```text
User adds song
      ↓
POST /rooms/:id/queue
      ↓
Permission check
      ↓
Queue service
      ↓
MongoDB
      ↓
QUEUE_UPDATED
      ↓
Socket.IO
      ↓
All participants update UI
```

Nếu cần vote:

```text
Song request
 ↓
Votes
 ↓
Threshold
 ↓
Move into queue
```

Concurrent queue modifications phải được xử lý an toàn.

---

# 14. Chat flow

```text
User types message
      ↓
Client validation
      ↓
Socket.IO
      ↓
Auth
      ↓
Room permission
      ↓
Rate limit
      ↓
Message service
      ↓
MongoDB
      ↓
Broadcast CHAT_MESSAGE
      ↓
Participants
```

History:

```text
GET /rooms/:id/messages?cursor=...
```

Dùng cursor pagination.

Không load toàn bộ message history.

---

# 15. Reaction flow

```text
User clicks ❤️
      ↓
Socket.IO
      ↓
Validate
      ↓
Broadcast REACTION_SEND
      ↓
Floating animation
      ↓
Auto disappear
```

Transient animation không cần lưu mọi event vào MongoDB.

Nếu cần analytics, aggregate theo batch hoặc event strategy phù hợp.

---

# 16. Presence flow

```text
User connects
      ↓
Socket.IO
      ↓
Redis presence
      ↓
Broadcast ONLINE
```

Disconnect:

```text
Socket disconnect
      ↓
Grace period
      ↓
Redis update
      ↓
Broadcast OFFLINE
```

Không ghi MongoDB mỗi lần socket reconnect.

---

# 17. Listen Together flow

Đây là product loop quan trọng nhất.

```text
Emma is listening to Apocalypse
             ↓
       [Listen Together]
             ↓
        Select people
             ↓
      Send invitation
             ↓
         Notification
             ↓
       Emma accepts
             ↓
   Create / join listening session
             ↓
       Create / join room
             ↓
    Synchronize playback
             ↓
       Chat + Reactions
```

Mục tiêu:

**một click từ discovery → shared listening session.**

---

# 18. Social Feed flow

```text
Alex is listening to Starboy
          ↓
       Feed item
          ↓
   ❤️ 🔥 💬
          ↓
 🎧 Listen Together
```

CTA Listen Together phải nổi bật.

---

# 19. Database relationships

```text
User
 ├── Friendship
 ├── Follow
 ├── Playlist
 ├── Message
 ├── Notification
 ├── ListeningSession
 └── Room membership

Room
 ├── Host
 ├── Members
 ├── Queue
 ├── Messages
 ├── Reactions
 └── Playback state

Playlist
 └── PlaylistTrack
       └── Track

ListeningSession
 ├── Room
 ├── Users
 └── Tracks
```

---

# 20. MongoDB collections

```text
users
friendships
follows
blocks

rooms
roomMembers
roomQueue
roomMessages
roomReactions

tracks
artists
albums

playlists
playlistTracks

notifications

listeningSessions
listeningActivities

reports
moderationActions
```

---

# 21. Repository pattern

Backend:

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
MongoDB
```

Ví dụ:

```text
RoomsController
      ↓
RoomsService
      ↓
RoomsRepository
      ↓
RoomModel
```

Controller không chứa business logic.

---

# 22. Realtime architecture

```text
realtime/
├── gateways/
│   ├── room.gateway.ts
│   ├── chat.gateway.ts
│   └── presence.gateway.ts
│
├── events/
│   ├── room.events.ts
│   ├── playback.events.ts
│   ├── chat.events.ts
│   └── reaction.events.ts
│
├── guards/
│   └── socket-auth.guard.ts
│
└── adapters/
    └── redis.adapter.ts
```

---

# 23. Event catalog

```text
ROOM_JOIN
ROOM_LEAVE

PLAY
PAUSE
SEEK
NEXT
PREVIOUS
CHANGE_TRACK

QUEUE_ADD
QUEUE_REMOVE
QUEUE_REORDER

CHAT_MESSAGE
REACTION_SEND

HOST_TRANSFER

USER_INVITE
USER_KICK
```

Mọi event mới phải:
1. có payload type
2. có authorization rule
3. có validation
4. xác định persistence hay transient
5. update docs

---

# 24. Security flow

```text
Request
 ↓
Authentication
 ↓
Validation
 ↓
Authorization
 ↓
Business Logic
 ↓
Persistence
```

Ví dụ host-only action:

```text
Client says:
"I am host"

        ↓

Server ignores that claim

        ↓

Server checks:
room.hostId === currentUser.id

        ↓

Allow / Deny
```

---

# 25. Error flow

```text
API error
 ↓
Global exception filter
 ↓
Standard error response
 ↓
Frontend error state
 ↓
Retry / fallback / message
```

Không expose stack trace production.

---

# 26. Frontend data flow

```text
Page
 ↓
Feature Hook
 ↓
TanStack Query
 ↓
API Service
 ↓
NestJS
```

Realtime:

```text
Socket
 ↓
Feature realtime hook
 ↓
Zustand/domain store
 ↓
UI
```

Không đưa toàn bộ server state vào Zustand.

- TanStack Query = server state
- Zustand = client/UI/realtime state phù hợp

---

# 27. Feature ownership

| Feature | Responsibility |
|---|---|
| auth | Login/register/session |
| users | Profile |
| rooms | Room lifecycle |
| playback | Synchronization |
| music | Track/provider |
| player | Local audio UI/engine |
| chat | Room chat |
| friends | Friendship/follow |
| messages | Direct messaging |
| playlists | Playlist |
| discovery | Search/recommendation |
| listening | Listening sessions/stats |
| notifications | User notifications |
| moderation | Reports/block/safety |

---

# 28. Project development flow

```text
Requirement
    ↓
Domain design
    ↓
Data model
    ↓
API contract
    ↓
Permission
    ↓
Realtime contract
    ↓
Backend
    ↓
Frontend
    ↓
Tests
    ↓
Documentation
    ↓
Review
```

Không bắt đầu bằng UI nếu feature có backend/realtime complexity lớn.

---

# 29. MVP screen flow

```text
Landing
   ↓
Login/Register
   ↓
Onboarding
   ↓
Home
   ├── Discover
   ├── Trending
   ├── Friends listening
   └── Live rooms
           ↓
       Room
       ├── Player
       ├── Queue
       ├── Members
       ├── Chat
       └── Reactions
```

---

# 30. Room screen

```text
┌──────────────────────────────────────────────┐
│ ← Back      Late Night Vibes            ⚙   │
│                                              │
│                 Album Art                    │
│                                              │
│            Blinding Lights                   │
│              The Weeknd                      │
│                                              │
│       ━━━━━━━━━●━━━━━━━━                    │
│                                              │
│             ⏮    ▶    ⏭                    │
│                                              │
│           ❤️ 🔥 😂 😭 💜                    │
│                                              │
├──────────────────────────────────────────────┤
│ Listening now                                │
│                                              │
│  👤 👤 👤 👤 +12                            │
│                                              │
├──────────────────────────────────────────────┤
│ Chat                                         │
│                                              │
│ Alex: this song is insane 🔥                 │
│ Mia: nostalgic 😭                            │
│                                              │
│ [Write a message...]                    ➤   │
└──────────────────────────────────────────────┘
```

---

# 31. Mobile navigation tương lai

```text
Home
Discover
Create
Rooms
Profile
```

Secondary screens:
- Friends
- Messages
- Library
- Settings

Mobile dùng cùng:
- NestJS
- MongoDB
- Redis
- Socket.IO
- Music provider abstraction

---

# 32. Scaling path

## Stage 1

```text
Next.js
NestJS
MongoDB Atlas
Redis
R2
CDN
```

## Stage 2

```text
Multiple NestJS instances
        ↓
Redis adapter
        ↓
Shared realtime
```

## Stage 3

```text
CDN optimization
Audio processing
HLS
Caching
Read optimization
```

## Stage 4

Chỉ khi có bottleneck thực:

```text
Dedicated services
Message infrastructure
Advanced search
Recommendation infrastructure
Workers
Queue systems
```

Không dùng microservices ngay từ MVP.

---

# 33. Folder principle

## Feature-first

```text
features/
├── rooms/
├── music/
├── player/
└── friends/
```

Không:

```text
components/
  300 components
```

## Backend module-first

```text
modules/
├── rooms/
├── music/
├── playlists/
└── friends/
```

## Shared only when genuinely shared

```text
components/ui
packages/types
packages/validation
```

---

# 34. Definition of Done

Feature chỉ hoàn thành khi có:

- UI
- API
- persistence
- authorization
- validation
- realtime nếu cần
- loading
- error
- empty state
- responsive
- accessibility cơ bản
- tests
- typecheck
- lint
- documentation nếu architecture thay đổi

---

# 35. Nguyên tắc vàng

### 1.
MongoDB = persistent data.

### 2.
Redis = realtime/temporary state.

### 3.
Socket.IO = communication.

### 4.
R2/S3 = media storage.

### 5.
CDN = media delivery.

### 6.
NestJS = business backend.

### 7.
Next.js = web client.

### 8.
React Native = mobile client tương lai.

### 9.
Server = source of truth cho room playback.

### 10.
Listen Together = trung tâm sản phẩm.

---

# 36. Roadmap

```text
PHASE 1
Auth
 ↓
User
 ↓
Music
 ↓
Player
 ↓
Room
 ↓
Join
 ↓
Presence
 ↓
Playback Sync
 ↓
Queue
 ↓
Chat
 ↓
Reaction

PHASE 2
Friends
 ↓
Messages
 ↓
Playlists
 ↓
Listen Together
 ↓
Notifications
 ↓
Social Feed

PHASE 3
Discovery
 ↓
Vibe
 ↓
Statistics
 ↓
Gamification
 ↓
Communities
 ↓
AI

PHASE 4
Mobile
 ↓
Push Notifications
 ↓
Advanced Audio
 ↓
Scale
```

---

# 37. First milestone

Mục tiêu đầu tiên:

```text
User A
  ↓
Create Room
  ↓
User B
  ↓
Join Room
  ↓
Both online
  ↓
Host presses PLAY
  ↓
Both players synchronize
  ↓
Chat
  ↓
Reaction
```

Nếu flow này ổn định, SoundWithMe đã có được **technical core** quan trọng nhất.

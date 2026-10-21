# SoundWithMe — chạy toàn bộ app ở máy local (+ link Cloudflare để test từ máy/điện thoại khác).
#
#   powershell -ExecutionPolicy Bypass -File .\start.ps1             # Docker + Mongo/Redis + API + Web (bản production, mượt) + tunnel
#   powershell -ExecutionPolicy Bypass -File .\start.ps1 -Dev        # bản dev: sửa code tự reload, nhưng nặng/chậm hơn nhiều
#   powershell -ExecutionPolicy Bypass -File .\start.ps1 -NoTunnel   # chỉ chạy local (http://localhost:3000)
#   powershell -ExecutionPolicy Bypass -File .\start.ps1 -Stop       # tắt app, tunnel và Mongo/Redis
#
# Link tunnel (https://xxx.trycloudflare.com) đổi mỗi lần chạy. Nó là HTTPS nên
# mic dùng được trên điện thoại. Web tự proxy /api/v1 và /socket.io sang API
# (next.config.mjs), nên chỉ cần tunnel cổng 3000.
param(
  [switch]$Dev,
  [switch]$NoTunnel,
  [switch]$Stop
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$toolsDir = Join-Path $root ".tools"
$cloudflared = Join-Path $toolsDir "cloudflared.exe"
$tunnelLog = Join-Path $toolsDir "tunnel.log"
$appLog = Join-Path $toolsDir "app.log"

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }

function Test-Port($port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try { $client.Connect("127.0.0.1", $port); return $true } catch { return $false } finally { $client.Close() }
}

function Wait-Until($what, $timeoutSec, [scriptblock]$check) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while (-not (& $check)) {
    if ((Get-Date) -gt $deadline) { throw "Hết thời gian chờ: $what" }
    Start-Sleep -Seconds 2
  }
}

function Test-Docker {
  cmd /c "docker info >nul 2>&1"
  return $LASTEXITCODE -eq 0
}

function Stop-Port($port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Set-Location $root

if ($Stop) {
  Step "Tắt tunnel, Web (3000), API (4000)"
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
  Stop-Port 3000
  Stop-Port 4000
  Step "Tắt Mongo/Redis"
  docker compose stop
  Write-Host "`nĐã tắt." -ForegroundColor Green
  exit 0
}

# 1. Docker Desktop
Step "Docker"
if (-not (Test-Docker)) {
  $dockerExe = @(
    "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $dockerExe) { throw "Không tìm thấy Docker Desktop — cài Docker Desktop trước." }
  Write-Host "Đang mở Docker Desktop (lần đầu có thể mất 1-2 phút)..."
  Start-Process $dockerExe
  Wait-Until "Docker Desktop" 180 { Test-Docker }
}
Write-Host "Docker OK"

# 2. MongoDB + Redis
Step "MongoDB + Redis"
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "docker compose up thất bại" }
Wait-Until "MongoDB (27017)" 60 { Test-Port 27017 }
Wait-Until "Redis (6379)" 60 { Test-Port 6379 }
Write-Host "MongoDB + Redis OK"

# 3. Dependencies
if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Step "pnpm install"
  pnpm install
  if ($LASTEXITCODE -ne 0) { throw "pnpm install thất bại" }
}

# 4. API + Web, chạy nền.
# Production (mặc định): JS ~175 KB thay vì ~12 MB của bản dev, không compile
# lúc mở trang — khác biệt rất rõ khi mở qua tunnel/điện thoại.
$mode = if ($Dev) { "dev" } else { "production" }
Step "API (4000) + Web (3000) — bản $mode"
# Tắt bản đang chạy (dev và production dùng chung thư mục .next).
Stop-Port 3000
Stop-Port 4000
if ($Dev) {
  $runCommand = "pnpm dev"
} else {
  Write-Host "Đang build (lần đầu ~1 phút; không đổi code thì nhanh nhờ cache)..."
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw "pnpm build thất bại" }
  $runCommand = "pnpm --parallel --filter @soundwithme/api --filter @soundwithme/web start"
}
# Chạy ẩn (không mở cửa sổ nào), log ghi vào .tools\app.log.
New-Item -ItemType Directory -Force $toolsDir | Out-Null
Start-Process cmd -ArgumentList "/c", "$runCommand > `"$appLog`" 2>&1" -WorkingDirectory $root -WindowStyle Hidden
Write-Host "Đang chờ API và Web khởi động..."
Wait-Until "API (4000)" 180 { Test-Port 4000 }
Wait-Until "Web (3000)" 180 { Test-Port 3000 }
# Gọi trang lần đầu để Next sẵn sàng (tránh link tunnel bị chậm/timeout).
try { Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 120 | Out-Null } catch {}
Write-Host "Local: http://localhost:3000" -ForegroundColor Green

if ($NoTunnel) { exit 0 }

# 5. Cloudflare quick tunnel (không cần tài khoản). http2 vì mạng này chặn QUIC (UDP 7844).
Step "Cloudflare tunnel"
if (-not (Test-Path $cloudflared)) {
  New-Item -ItemType Directory -Force $toolsDir | Out-Null
  Write-Host "Đang tải cloudflared..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflared -UseBasicParsing
}
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item $tunnelLog -ErrorAction SilentlyContinue
Start-Process $cloudflared -ArgumentList "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", "http://localhost:3000", "--logfile", "`"$tunnelLog`"" -WindowStyle Hidden

$url = $null
$deadline = (Get-Date).AddSeconds(60)
while (-not $url -and (Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  if (Test-Path $tunnelLog) {
    $match = Select-String -Path $tunnelLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($match) { $url = $match.Matches[0].Value }
  }
}
if (-not $url) { throw "Không lấy được link tunnel — xem $tunnelLog" }
# Link chỉ dùng được sau khi tunnel đã nối tới Cloudflare (trước đó trả lỗi 530).
Wait-Until "tunnel kết nối Cloudflare" 60 { Select-String -Path $tunnelLog -Pattern "Registered tunnel connection" -Quiet }

Write-Host ""
Write-Host "==============================================================" -ForegroundColor Green
Write-Host " Link test (HTTPS, mic dùng được): $url" -ForegroundColor Green
Write-Host " Local:                            http://localhost:3000" -ForegroundColor Green
Write-Host "==============================================================" -ForegroundColor Green
Write-Host " App chạy ẩn (không có cửa sổ). Xem log: Get-Content .tools\app.log -Wait"
Write-Host " Tắt hết: powershell -ExecutionPolicy Bypass -File .\start.ps1 -Stop"
Write-Host " Lưu ý: Google login chỉ chạy trên localhost (callback URL); qua link tunnel hãy dùng đăng nhập thường/guest."

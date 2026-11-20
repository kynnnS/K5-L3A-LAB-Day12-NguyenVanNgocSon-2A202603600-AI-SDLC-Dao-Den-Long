# Đảo Đèn Lồng

> **Video demo:** _sẽ được thêm ở Phase 4 (Release `v1.0.0`)._
> Đề bài gốc của lab: [docs/lab/README.md](docs/lab/README.md) · Yêu cầu: [PRD-0](docs/requirements/PRD-0.md) · [Ticket-02](docs/requirements/TICKET-02.md)

Game 3D góc nhìn thứ ba. **Mây**, người giữ đèn nhỏ tuổi đội nón lá, gom **đom đóm** để thắp lại 5 **Đèn Lồng Lớn** của Đảo Bến và né **Bóng Mực** trong sương đen.

Nguyễn Văn Ngọc Sơn · 2A202603600 · K5-L3A Day 12 AI-SDLC

## Cài đặt và chạy (macOS / Linux, cần Node.js ≥ 20)

```bash
npm ci
npm run build
npm start          # mở http://localhost:4173 trong trình duyệt
```

## Điều khiển

| Phím | Hành động |
|---|---|
| W A S D (hoặc ↑ ↓) | Di chuyển theo hướng camera |
| Kéo chuột / ← → | Xoay camera (độ nhạy chỉnh trong Cài đặt) |
| Space | Nhảy (chỉ khi đứng trên đất) |
| Shift | Lướt 14 m/s trong 0.2 s (hồi chiêu 1.5 s) |
| E | Nạp đom đóm vào đèn chưa sáng gần nhất (trong 2 m) |
| F | Tỏa Sáng: tốn 3 đom đóm, làm choáng Bóng Mực trong 5 m (hồi chiêu 3 s) |
| Esc / P | Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu |
| Enter | Xác nhận trên các màn hình menu |

## Luật chơi (số chuẩn Ticket-02)

- **3 Đêm:** Đảo Bến (5 đèn, 300 s), Đảo Cau (2 đảo nối bằng cầu tre và bục nhảy, 6 đèn, 330 s), Đảo Chuông (3 tầng, dốc, bục nhảy, tháp chuông, gió mạnh, 7 đèn, 360 s).
- Đi qua đom đóm (≤ 1 m) để tự nhặt, mang tối đa 10 con. Mỗi đèn cần 10 đom đóm, nạp nhiều lần được.
- **Bóng Mực** đuổi khi Mây ở trong 12 m và bỏ đuổi ngoài 18 m. Bị chạm: −1 Ngọn Lửa, đánh rơi một nửa số đom đóm (nhặt lại được trong 8 s), bất tử 1.5 s.
- Đèn đã sáng tạo vùng an toàn 6 m mà Bóng Mực không vào được.
- **Gió Lạc** (Đêm 2–3) cướp tối đa 3 đom đóm khi Mây mang từ 5 con trở lên. Tỏa Sáng vào nó để nó thả đồ ra.
- **Bùa Gió** (đỏ viền vàng) cho 10 s chạy 7.2 m/s và lướt không hồi chiêu.
- Rơi khỏi đảo: −1 Ngọn Lửa, mất toàn bộ đom đóm, hồi sinh ở điểm xuất phát.
- Thắng khi thắp hết đèn. Thua khi hết 3 Ngọn Lửa hoặc khi bình minh đến. Thua thì chơi lại Đêm đó.

## Cách tính điểm (chuẩn hóa)

| Sự kiện | Điểm |
|---|---|
| Mỗi đom đóm **nạp** vào đèn | +10 |
| Thắp 1 đèn | +100 |
| Mỗi Bóng Mực trúng Tỏa Sáng (mỗi lần) | +5 |
| Khi thắng: mỗi giây còn lại (làm tròn xuống) | +2 |
| Khi thắng: mỗi Ngọn Lửa còn lại | +50 |

Tổng điểm của game là tổng điểm các Đêm đã thắng.

## Chế độ headless (Test Contract v1.1)

Khai báo trong [game.contract.json](game.contract.json). Sau `npm ci && npm run build`:

```bash
node build/headless/cli.js --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```

- `--night` nhận 1, 2, 3. Mã thoát: `0` thành công · `1` sai tham số · `2` file inputs/scenario sai định dạng. Lỗi in ra stderr, stdout để trống.
- Tuning đúng số chuẩn của Ticket-02. Core đọc trực tiếp từ `game.contract.json`.
- Các giả định cho chỗ ticket chưa rõ (B1–B14, ví dụ điểm xuất phát Đêm 3 là (0,0,−30)) có trong [docs/notes/phase-2.md](docs/notes/phase-2.md).

## Kiểm thử và bằng chứng

```bash
npm test                         # unit + 28 scenario chạy qua CLI thật (3 Đêm)
bash scripts/verify.sh phase-2   # typecheck, test, build, tất định, hiệu năng + lưu bằng chứng
```

- Bằng chứng: [Phase 1](docs/proof/phase-1/) · [Phase 2](docs/proof/phase-2/)
- Giả định, acceptance criteria và truy vết: [Phase 1](docs/notes/phase-1.md) · [Phase 2](docs/notes/phase-2.md)
- Nhật ký dùng AI: [docs/notes/ai-usage.md](docs/notes/ai-usage.md)

## Kiến trúc

```
src/core/      luật game thuần (fixed step 1/60 s, PRNG có seed, 12 bước/tick), maps.ts = 3 bản đồ chuẩn
src/headless/  CLI theo Test Contract
src/client/    Three.js: models.ts (hình từ maps.ts), input.ts, hud.ts, audio.ts (WebAudio), settings.ts, main.ts (chuỗi 3 Đêm)
tests/         unit (core) + scenarios (chạy CLI thật, có fixture)
```

## Sáng tạo của tôi

Tất cả chỉ nằm ở client, không đổi đầu ra headless:

- **Lời Ông Đăng** cho từng Đêm và màn Bình Minh khép lại câu chuyện.
- **Âm thanh tự sinh** bằng WebAudio (nhạc đêm ngũ cung và các hiệu ứng). Không dùng asset ngoài nên không có rủi ro bản quyền.
- Đèn nhỏ trên nón lá của Mây sáng mạnh hơn khi mang nhiều đom đóm. Đèn đang nạp dở có cột sáng tiến độ.
- Đèn đã sáng có vòng vàng đánh dấu vùng an toàn. Lá bay báo trước gió mạnh.
- Bộ đếm FPS (góc dưới trái) để tự đo hiệu năng.

## Harness AI

[CLAUDE.md](CLAUDE.md) · skill [verify-phase](.claude/skills/verify-phase/SKILL.md) · Stop hook [stop-gate.sh](scripts/hooks/stop-gate.sh) (chặn agent kết thúc khi test đỏ) · CI [ci.yml](.github/workflows/ci.yml)

## Giấy phép

Mã nguồn: [MIT](LICENSE). Nguồn thư viện và công cụ: [CREDITS.md](CREDITS.md).

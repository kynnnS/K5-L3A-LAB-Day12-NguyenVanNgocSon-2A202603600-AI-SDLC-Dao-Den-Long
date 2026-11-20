# Đảo Đèn Lồng

> **Video demo:** không kèm theo bản nộp này. **Bản chạy được:** [Release v1.0.0](https://github.com/kynnnS/K5-L3A-LAB-Day12-NguyenVanNgocSon-2A202603600-AI-SDLC-Dao-Den-Long/releases/tag/v1.0.0)
> Đề bài gốc của lab: [docs/lab/README.md](docs/lab/README.md) · Yêu cầu: [PRD-0](docs/requirements/PRD-0.md) · [Ticket-02](docs/requirements/TICKET-02.md) · [Ticket-03](docs/requirements/TICKET-03.md) · [Ticket-04](docs/requirements/TICKET-04.md)

Game 3D góc nhìn thứ ba, chơi trên trình duyệt. **Mây**, người giữ đèn nhỏ tuổi đội nón lá, gom **đom đóm** để thắp và giữ dầu cho các **Đèn Lồng Lớn** qua 3 Đêm trên 3 hòn đảo, né **Bóng Mực** hút dầu và **Gió Lạc** cướp đom đóm, cho tới bình minh.

_Ảnh chụp màn hình: chưa có. Máy làm bài không cấp quyền chụp màn hình cho công cụ tự động; xem [docs/notes/phase-4.md](docs/notes/phase-4.md)._

## Yêu cầu hệ thống

- macOS hoặc Linux, Node.js ≥ 20 (đã thử với Node 24), trình duyệt có WebGL2 (Chrome, Edge, Safari, Firefox).
- Bench: Chrome/Chromium nếu có (tắt được vsync, đo được RSS); nếu không, dùng trình duyệt mặc định (Safari không tắt được vsync).

Nguyễn Văn Ngọc Sơn · 2A202603600 · K5-L3A Day 12 AI-SDLC

## Cài đặt và chạy (macOS / Linux, cần Node.js ≥ 20)

```bash
npm ci
npm run build
npm start          # máy chủ game + bảng xếp hạng, mở http://localhost:4173
```

Bản Release (thư mục web tĩnh): giải nén `dao-den-long-v1.0.0-web.zip`, rồi chạy `npx serve dist` (hoặc `python3 -m http.server -d dist`). Khi chạy tĩnh như vậy, bảng xếp hạng lưu trong trình duyệt (`localStorage`); khi chạy bằng `npm start`, bảng xếp hạng lưu ra đĩa.

## Điều khiển

| Phím | Hành động |
|---|---|
| W A S D | Di chuyển theo hướng camera |
| Kéo chuột / ← → | Xoay camera (độ nhạy chỉnh trong Cài đặt) |
| Space | Nhảy (chỉ khi đứng trên đất) |
| Shift | Lướt 14 m/s trong 0.2 s (hồi chiêu 1.5 s) |
| E | Ở đèn gần nhất trong 2 m: nạp để thắp (10 đom đóm, thắp lại chỉ 5) hoặc châm dầu cho đèn đang sáng |
| F | Tỏa Sáng: tốn 3 đom đóm, làm choáng Bóng Mực trong 5 m (hồi chiêu 3 s) |
| Esc / P | Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu (chuyển sang tab khác cũng tự tạm dừng) |
| Enter | Xác nhận trên các màn hình menu |

Mọi phím hành động đổi được trong **Cài đặt → Phím**: game báo khi hai hành động trùng phím (không cho lưu), có nút **Khôi phục mặc định**, và lựa chọn được lưu. Esc luôn mở menu tạm dừng; ← → luôn xoay camera.

**Dễ tiếp cận (Cài đặt):** bảng màu dễ phân biệt; giảm chuyển động (tắt rung camera và chớp màn hình); chữ lớn ×1.25 (chữ UI tối thiểu 18 px ở 1280×720). Phụ đề và chỉ báo hình ảnh cho: Bóng Mực xuất hiện (kèm mũi tên ở mép màn hình chỉ hướng), gió sắp thổi, 10 giây cuối, đèn dưới 30 dầu.

**Bảng xếp hạng:** sau màn Bình Minh hoặc khi thua, nhập tên (3–12 ký tự: chữ, số, `_`, có thể dùng tiếng Việt có dấu) để lưu tổng điểm. Top 10, xem từ menu chính.

## Luật chơi (Ticket-02 + Ticket-03 "Đèn cạn dầu")

- **3 Đêm:** Đảo Bến (5 đèn, 240 s), Đảo Cau (2 đảo nối bằng cầu tre và bục nhảy, 6 đèn, 270 s), Đảo Chuông (3 tầng, dốc, bục nhảy, tháp chuông, gió mạnh, 7 đèn, 300 s).
- **Mục tiêu:** còn sống tới bình minh với ít nhất 60% số đèn đang sáng: Đêm 1 cần 3/5, Đêm 2 cần 4/6, Đêm 3 cần 5/7. Thắp đủ đèn sớm **không** kết thúc Đêm.
- Đi qua đom đóm (≤ 1 m) để tự nhặt. Túi đựng 10 con, mỗi lần thắp thành công (kể cả thắp lại) thêm 2, tối đa 20.
- **Dầu đèn:** đèn vừa thắp có 100 dầu, hao 1 dầu/giây. Bấm E ở đèn đang sáng để châm: mỗi đom đóm thêm 10 dầu. Hết dầu thì đèn tắt; thắp lại chỉ cần 5 đom đóm.
- Đèn sáng có từ 30 dầu trở lên tạo vùng an toàn 6 m mà Bóng Mực không vào được. Dưới 30 dầu, đèn nhấp nháy và **mất vùng an toàn**.
- **Bóng Mực** đuổi khi Mây ở trong 12 m và bỏ đuổi ngoài 18 m. Lúc lang thang, nó tìm đèn yếu (dầu < 30) để **hút dầu** (5 dầu/giây mỗi con). Tới gần trong 6 m hoặc Tỏa Sáng để đuổi nó đi. Bị chạm: −1 Ngọn Lửa, đánh rơi một nửa số đom đóm (nhặt lại được trong 8 s), bất tử 1.5 s.
- **Gió Lạc** (Đêm 2–3) cướp tối đa 3 đom đóm khi Mây mang từ 5 con trở lên. Tỏa Sáng vào nó để nó thả đồ ra.
- **Bùa Gió** (đỏ viền vàng) cho 10 s chạy 7.2 m/s và lướt không hồi chiêu.
- Rơi khỏi đảo: −1 Ngọn Lửa, mất toàn bộ đom đóm, hồi sinh ở điểm xuất phát.
- Thua khi hết 3 Ngọn Lửa (ngay lập tức) hoặc khi bình minh đến mà không đủ đèn sáng. Thua thì chơi lại Đêm đó.
- **Bảng màu dễ phân biệt** (Cài đặt): Bóng Mực viền/mắt #00B3FF, cảnh báo UI màu trắng kèm ⚠. Đèn tắt luôn bị xẹp và rách giấy để nhận ra mà không cần màu.

## Cách tính điểm (Ticket-03)

| Sự kiện | Điểm |
|---|---|
| Mỗi đom đóm nạp vào đèn (thắp, thắp lại hoặc châm dầu) | +5 |
| Thắp đèn lần đầu | +100 |
| Thắp lại đèn đã tắt | +40 |
| Mỗi Bóng Mực trúng Tỏa Sáng | +5 (tổng +15 nếu nó đang hút dầu) |
| Khi thắng lúc bình minh: mỗi đèn đang sáng | +50 + phần nguyên của dầu còn lại |
| Khi thắng lúc bình minh: mỗi Ngọn Lửa còn lại | +50 |

Không còn thưởng thời gian. Tổng điểm của game là tổng điểm các Đêm đã thắng (chơi lại không cộng trùng).

## Chế độ headless (Test Contract v1.3)

Khai báo trong [game.contract.json](game.contract.json). Sau `npm ci && npm run build`:

```bash
node build/headless/cli.js --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```

- `--night` nhận 1, 2, 3. Mã thoát: `0` thành công · `1` sai tham số · `2` file inputs/scenario sai định dạng. Lỗi in ra stderr, stdout để trống.
- Tuning đúng số chuẩn của Ticket-02 và Ticket-03 (`fuel_max`, `win_ratio`, `capacity_max`…). Core đọc trực tiếp từ `game.contract.json`.
- Giả định cho chỗ ticket chưa rõ: B1–B20 trong [docs/notes/phase-2.md](docs/notes/phase-2.md), C1–C17 trong [docs/notes/phase-3.md](docs/notes/phase-3.md). Quyết định thiết kế Phase 3: [ADR-003](docs/architecture/ADR-003-lantern-fuel-and-dawn-survival.md). Thay đổi phá vỡ tương thích: [CHANGELOG.md](CHANGELOG.md).

## Benchmark, soak, xuất bảng xếp hạng (Ticket-04)

```bash
node build/headless/bench.js --seed 42 --duration 30 --out bench.json                  # = bench_cmd
node --expose-gc --jitless build/headless/soak.js --seed 7 --nights 10 --out soak.json  # = soak_cmd
node build/headless/serve.js --export-leaderboard out.json                              # = run_cmd
```

- **Bench** mở game ở cửa sổ 1280×720 (canvas đúng 1280×720), Đêm 1 với 200 Bóng Mực và 100 đom đóm, camera bay vòng 15 s/vòng. Đo 3 s khởi động + `--duration` giây rồi tự thoát (mã 0). Với Chrome/Chromium thì tắt vsync (`--disable-gpu-vsync --disable-frame-rate-limit`) và đo RSS của trình duyệt. Với Safari thì **không tắt được vsync** (`vsync_off: false`) và `peak_mem_mb` là `null` vì không theo dõi được tiến trình của Safari. **Cửa sổ bench phải hiển thị trên màn hình** (trình duyệt ngừng vẽ cửa sổ bị ẩn; khi đó bench tự đo lại).
- **Soak** chạy 10 Đêm trong cùng một tiến trình. `--jitless` tắt trình biên dịch JIT của V8: không có cờ này RSS tăng khoảng 18 MB do mã máy biên dịch một lần, dù heap còn sống không tăng ([bằng chứng](docs/proof/phase-4/memory-diagnosis.log)).
- Kết quả tự chạy: [soak.json](soak.json), [bench.json](bench.json).

## Kiểm thử và bằng chứng

```bash
npm test                         # unit + 44 scenario chạy qua CLI thật (3 Đêm)
bash scripts/verify.sh phase-4   # typecheck, test, build, tất định, hiệu năng, soak, export bảng xếp hạng + lưu bằng chứng
```

- Bằng chứng: [Phase 1](docs/proof/phase-1/) · [Phase 2](docs/proof/phase-2/) · [Phase 3](docs/proof/phase-3/) · [Phase 4](docs/proof/phase-4/)
- Giả định, acceptance criteria và truy vết: [Phase 1](docs/notes/phase-1.md) · [Phase 2](docs/notes/phase-2.md) · [Phase 3](docs/notes/phase-3.md) · [Phase 4](docs/notes/phase-4.md)
- Retro cả dự án: [docs/notes/retro.md](docs/notes/retro.md) · Thay đổi từng phase: [CHANGELOG.md](CHANGELOG.md)
- Nhật ký dùng AI: [docs/notes/ai-usage.md](docs/notes/ai-usage.md)

## Kiến trúc

```
src/core/      luật game thuần (fixed step 1/60 s, PRNG có seed, 12 bước/tick), maps.ts = 3 bản đồ chuẩn
src/headless/  CLI theo Test Contract (cli.js), bench.js, soak.js, serve.js (máy chủ game + bảng xếp hạng)
src/shared/    luật dùng chung cho máy chủ và client: bảng xếp hạng, đổi phím, công thức bench
src/client/    Three.js: models.ts (hình từ maps.ts), input.ts, hud.ts, audio.ts (WebAudio), settings.ts, main.ts (chuỗi 3 Đêm)
tests/         unit (core) + scenarios (chạy CLI thật, có fixture)
```

## Sáng tạo của tôi

Tất cả chỉ nằm ở client, không đổi đầu ra headless:

- **Lời Ông Đăng** cho từng Đêm và màn Bình Minh khép lại câu chuyện.
- **Âm thanh tự sinh** bằng WebAudio (nhạc đêm ngũ cung và các hiệu ứng). Không dùng asset ngoài nên không có rủi ro bản quyền.
- Đèn nhỏ trên nón lá của Mây sáng mạnh hơn khi mang nhiều đom đóm. Đèn đang nạp dở có cột sáng tiến độ.
- Đèn đã sáng có vòng vàng đánh dấu vùng an toàn (tắt khi dầu < 30). Lá bay báo trước gió mạnh. Mũi tên chỉ cả đèn tắt lẫn đèn sắp cạn dầu.
- Bộ đếm FPS (góc dưới trái) để tự đo hiệu năng.

## Harness AI

[CLAUDE.md](CLAUDE.md) · skill [verify-phase](.claude/skills/verify-phase/SKILL.md) · Stop hook [stop-gate.sh](scripts/hooks/stop-gate.sh) (chặn agent kết thúc khi test đỏ) · CI [ci.yml](.github/workflows/ci.yml)

## Giấy phép

Mã nguồn: [MIT](LICENSE). Nguồn thư viện và công cụ: [CREDITS.md](CREDITS.md).

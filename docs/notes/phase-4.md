# Phase 4: Ticket-04 "Bình minh: phát hành v1.0.0" (Contract v1.3)

Yêu cầu gốc: [../requirements/TICKET-04.md](../requirements/TICKET-04.md). Bằng chứng: [../proof/phase-4/](../proof/phase-4/). Retro cả dự án: [retro.md](retro.md).

**Baseline trước khi sửa:** commit `8ced3a1` (tag `phase-3` ở máy), `bash scripts/verify.sh phase-3` 6/6 PASS, 148/148 test.

## 1. Change Impact Analysis

| Mục Ticket-04 | Loại | Thay đổi | Ảnh hưởng test |
|---|---|---|---|
| Contract v1.3 (`bench_cmd`, `soak_cmd`) | Thay `contract_version` | `game.contract.json`; `run_cmd` đổi từ `npm start` sang `node build/headless/serve.js` để nhận được tham số nối thêm (`--export-leaderboard`; npm không chuyển tham số không có `--` vào script) | unit T1 đổi kỳ vọng 1.2 → 1.3 (bảng §4) |
| Benchmark | Mới | `src/core/bench.ts` (cảnh chuẩn, thuần, có seed); cờ `state.bench` trong `step()`; `src/headless/bench.ts` (máy chủ + mở trình duyệt + ghi `bench.json`); chế độ `?bench=1` trong client; `src/shared/benchMetrics.ts` (công thức) | Unit P4-1 |
| Soak | Mới | `src/headless/soak-core.ts` (thuần) + `soak.ts` (CLI, RSS) | Unit P4-2 (hàm + CLI thật); bước `soak` trong `verify.sh` |
| Bảng xếp hạng | Mới | `src/shared/leaderboard.ts` (luật); `src/headless/serve.ts` (lưu đĩa, API, export); `src/client/leaderboard.ts` + màn hình | Unit P4-3 (cả CLI export thật); bước `leaderboard-export` |
| Dễ tiếp cận | Mới | `src/shared/keymap.ts`, `settings.ts` (keymap, reducedMotion, largeText), `input.ts`, HUD phụ đề + mũi tên Bóng Mực, CSS 18 px / ×1.25 | Unit P4-4, `settings.test.ts` |
| Đóng gói, tài liệu | Mới | README, CHANGELOG, CREDITS, retro, gói Release | Cài sạch (log) |
| Luật chơi, số liệu, Contract v1.0–v1.2 | **Giữ nguyên** | Cảnh bench chỉ bật bằng cờ `bench` (không có trong scenario/CLI) nên đầu ra headless không đổi | 147 test Phase 1–3 không đổi vẫn PASS (chỉ T1 đổi phiên bản) |

## 2. Giả định

| # | Chỗ chưa rõ | Giả định |
|---|---|---|
| D1 | "Đêm thứ i dùng seed 7 + i" | `i` đếm từ 1: Đêm 1…10 dùng seed 8…17; loại Đêm xoay 1 → 2 → 3 → 1… |
| D2 | Input ngẫu nhiên của soak | PRNG riêng (seed `(seed + i) ^ 0x5bd1e995`), không dùng chung PRNG của game. Mỗi tick bốc riêng 4 xác suất; các nút là trạng thái giữ, hành động kích hoạt ở cạnh false → true như Contract |
| D3 | "Reset xong Đêm cuối" | Bỏ mọi tham chiếu tới state Đêm cuối rồi đọc RSS. Có `--expose-gc` thì chạy GC đầy đủ trước mỗi lần đọc RSS (đầu và cuối) |
| D4 | RSS tăng do JIT | `soak_cmd` chạy Node với `--jitless`. Đo thật: không có cờ, RSS 50.3 → 68.8 MB (×1.37); heap còn sống đứng yên khoảng 4.8 MB qua 60 Đêm ([memory-diagnosis.log](../proof/phase-4/memory-diagnosis.log)). Phần tăng là mã máy V8 biên dịch một lần, không phải rò rỉ. Với `--jitless`: 47.3 → 50.8 MB (×1.07), 10 Đêm vẫn chỉ mất 0.4 s. Lựa chọn này được ghi công khai, không giấu |
| D5 | "Rải đều trên đảo (seed 42)" | Phân bố đều trên đĩa bán kính 38 m (đảo 40 m, chừa 2 m mép): r = 38·√u, góc = 2π·v, PRNG mulberry32 seed 42. Bóng Mực ở độ cao mặt đất + 1 m |
| D6 | "Bóng Mực di chuyển theo luật wander bình thường" | Dùng đúng luật wander của core (đi về đèn tắt / đèn yếu gần nhất, C8). Trong bench Mây không bị nhắm tới, nên Bóng Mực không chuyển `chase` và luôn ở `wander` |
| D7 | Cửa sổ 1280×720, tắt vsync | Canvas cố định 1280×720 điểm ảnh (pixel ratio 1), dù cửa sổ lớn hơn. Có Chrome/Chromium thì mở cửa sổ `--window-size=1280,720` với `--disable-gpu-vsync --disable-frame-rate-limit` (`vsync_off: true`). Chỉ có Safari thì không tắt được vsync (`vsync_off: false`), ghi trong README |
| D8 | Hướng camera "ngược chiều kim đồng hồ khi nhìn từ trên xuống" | Theo quy ước góc của bản đồ (Ticket-02, từ +X về +Z): vị trí (30 cos a, 15, 30 sin a), a = 2π·t/15, xuất phát (30, 15, 0) |
| D9 | `frame_ms_p95` | Phân vị theo nearest-rank: phần tử thứ ceil(0.95·N) (đếm từ 1) của dt đã sắp xếp tăng dần |
| D10 | `load_ms` | Từ `performance.timeOrigin` của tiến trình bench (thời điểm tiến trình bắt đầu) tới lúc khung hình đầu tiên của cảnh bench vẽ xong (đồng hồ epoch của trang) |
| D11 | `peak_mem_mb` | Chrome/Chromium: tổng RSS của tiến trình trình duyệt và mọi tiến trình con (renderer, GPU), lấy mẫu mỗi 0.5 s trong lúc đo. Safari (mở bằng `open`, không theo dõi được tiến trình): `null` |
| D12 | Cửa sổ bị che khi đo | Trình duyệt ngừng vẽ cửa sổ ẩn. Khi trang báo `hidden`, phần đã đo bị bỏ và bench chạy lại 3 s khởi động lúc cửa sổ hiện lại, để không bao giờ ghi số đo của cửa sổ ẩn |
| D13 | "Lưu trên đĩa cục bộ" cho bản web | Máy chủ `serve.js` lưu `~/.dao-den-long/leaderboard.json` (hoặc `$DDL_LEADERBOARD`). Khi mở bằng hosting tĩnh không có máy chủ, client lưu vào `localStorage` |
| D14 | Tên tiếng Việt | Chấp nhận mọi chữ cái Unicode (`\p{L}`), số và `_`, 3–12 ký tự sau chuẩn hóa NFC (điểm cộng) |
| D15 | Điểm và seed của một mục | `score` = tổng điểm các Đêm đã thắng trong lượt chơi; `nights_won` = số Đêm đã thắng; `seed` = seed của Đêm vừa chơi |
| D16 | Phím hệ thống | Esc luôn mở menu tạm dừng, ← → luôn xoay camera. Gán các phím này cho hành động khác bị báo là xung đột |
| D17 | Giảm chuyển động | Tắt rung camera khi bị đánh, chớp đỏ màn hình và mọi animation/transition CSS (đồng hồ nhấp nháy). Đèn yếu vẫn nhấp nháy 1 Hz vì đó là chỉ báo bắt buộc của Ticket-03 |

## 3. Acceptance criteria

| Mục | Tiêu chí kiểm được | Kiểm bằng |
|---|---|---|
| §1 Cảnh bench | Đêm 1; đúng 200 Bóng Mực `wander` và 100 đom đóm trên đảo; L1–L3 sáng 100 dầu; Mây ở (0,0,0); không sinh thêm, không sát thương, không nhặt, không hao dầu, không kết thúc Đêm; Bóng Mực vẫn di chuyển | unit P4-1 (chạy 400 s cảnh bench) |
| §1 Công thức | avg_fps, p1_low_fps, frame_ms_p95 đúng định nghĩa | unit P4-1 (dãy dt tính tay) |
| §1 Lệnh | `bench_cmd --seed 42 --duration 30 --out bench.json` thoát 0 và ghi đủ 10 trường | Chạy thật: [bench-attempts.md](../proof/phase-4/bench-attempts.md) |
| §2 Soak | 10 Đêm trong 1 tiến trình, xoay vòng Đêm, `crashes = 0`, `mem_end ≤ 1.2 × mem_start`, đúng các trường | unit P4-2 (CLI thật); `verify.sh › soak`; [soak.json](../../soak.json) |
| §3 Bảng xếp hạng | Tên hợp lệ; top 10; điểm giảm dần, bằng điểm thì ai đạt trước đứng trên; ISO 8601 có múi giờ; lưu đĩa; export đúng thứ tự | unit P4-3; `verify.sh › leaderboard-export`; màn hình: đọc code |
| §4 Đổi phím | Mọi hành động; báo trùng; khôi phục mặc định; được lưu | unit P4-4 + `settings.test.ts`; giao diện: đọc code |
| §4 Phụ đề | Bóng Mực xuất hiện (+ mũi tên mép màn hình), gió sắp thổi, 10 s cuối, đèn < 30 dầu | Đọc code (`main.ts`, `hud.ts`) |
| §4 Giảm chuyển động, chữ | Tắt rung và chớp; mọi chữ UI ≥ 18 px (1rem = 18 px); chữ lớn ×1.25 | Đọc code (`style.css`: không còn cỡ chữ < 1rem) |
| §5 Đóng gói | Clone sạch → 3 lệnh → chơi được; README, CHANGELOG 4 phase, CREDITS, LICENSE; Release có bản chạy được | [clean-install.log](../proof/phase-4/clean-install.log); gói `release/` |
| §6 Contract v1.3 | `contract_version` 1.3, `bench_cmd`, `soak_cmd`; v1.0–v1.2 giữ nguyên | unit T1; 44 fixture CLI vẫn PASS |
| §7 Retro, video | Retro 1–2 trang | [retro.md](retro.md). Video: **không làm** theo quyết định của người làm bài |

## 4. Test cũ bị thay đổi

| Test | Cũ | Mới | Lý do |
|---|---|---|---|
| unit `T1 declares v1.2 …` | `contract_version` 1.2 | `declares v1.3 with bench_cmd / soak_cmd …` | Ticket-04 §6. Tuning không đổi |
| unit `settings.test.ts` | 3 trường cài đặt | 6 trường (thêm `reducedMotion`, `largeText`, `keymap`) + test bản lưu cũ | Ticket-04 §4. Bản lưu cũ vẫn đọc được |

Không có test nào bị skip.

## 5. Ma trận truy vết

Cập nhật sau lần chạy `bash scripts/verify.sh phase-4`.

## 6. Đánh giá Phase 4

Cập nhật sau lần kiểm chứng cuối.

# Phase 1: PRD-0 + Test Contract v1.0

Yêu cầu gốc: [../requirements/PRD-0.md](../requirements/PRD-0.md). Bằng chứng: [../proof/phase-1/](../proof/phase-1/).

## 1. Quyết định kỹ thuật

| Quyết định | Lý do |
|---|---|
| TypeScript + Three.js + Vite; headless chạy bằng Node (≥ 20) | Một bộ luật duy nhất (`src/core`) dùng chung cho game 3D và CLI. Bản web chạy được trên macOS/Linux |
| Core đọc `tuning` trực tiếp từ `game.contract.json` | Số khai báo luôn bằng số game dùng, nên khai sai là không thể (contract nói khai sai sẽ trượt test) |
| Mô phỏng fixed step 1/60 s, PRNG mulberry32 lưu trong state, không dùng `Math.random`/`Date` trong core | Tất định: cùng seed + scenario + inputs cho cùng output byte-to-byte |
| Thời lượng (stun, invuln, cooldown) lưu dưới dạng "tick kết thúc" (`stunUntil`, `invulnUntil`, `pulseReadyAt`) | Hiệu lực đúng `round(s × 60)` tick, không lệch một tick |
| Node cài cục bộ ở `~/.local/node` (tarball chính thức v24.22.3, đã kiểm SHA-256) | Máy không có Node/brew; không cần sudo |

## 2. Giả định cho chỗ PRD-0 mơ hồ

| # | Chỗ mơ hồ | Giả định đã chọn (và được test) |
|---|---|---|
| A1 | "Máu" | Máu = `flames` (3). Về 0 thì `lost` / `no_flames` |
| A2 | Hết đêm | `time_left_s` ≤ 0 thì `lost` / `dawn` (contract có reason `dawn`) |
| A3 | Tỏa sáng "tốn ánh sáng" | Trừ `pulse_cost` đom đóm đang mang. Không đủ đom đóm hoặc đang cooldown thì không có pulse, không ghi event. Pulse không trúng ai vẫn ghi `pulse` với `stunned_ids: []`. Bóng Mực đang choáng vẫn có thể bị choáng lại (được làm mới và tính điểm) |
| A4 | Nhặt đom đóm | Tự động khi khoảng cách ≤ `pickup_radius` và `carried < carry_capacity`, xét theo thứ tự danh sách |
| A5 | Nạp đèn | `interact` (cạnh false sang true) nạp vào đèn **chưa thắp gần nhất** trong `interact_radius`, `amount = min(carried, lantern_cost − deposited)`. Đủ `lantern_cost` thì `lantern_lit` |
| A6 | `safe_radius` | Chỉ áp cho đèn **đã thắp** ("Bóng Mực sợ những chiếc đèn"; đèn tắt không có ánh sáng). Bóng Mực bị đặt lại đúng trên biên bán kính |
| A7 | Bị chạm | Bóng Mực không choáng ở ≤ `shade_hit_radius`: trừ 1 flame, `dropped = floor(carried × hit_drop_ratio)` (số này biến mất, không rơi xuống đất), bất tử `invuln_s` giây. Mỗi tick tối đa 1 lần chạm |
| A8 | Rơi khỏi đảo | `fall_enabled: false`. Đảo tròn bán kính 40 m, có rìa chặn người chơi |
| A9 | Điểm khi thắng | Cộng `per_second_left × floor(time_left_s)` và `per_flame_left × flames` lúc thắng; thua thì không có thưởng |
| A10 | Thứ tự trong một bước | cạnh nút → di chuyển + nhảy → nhặt → nạp/thắp → pulse → sinh thực thể → Bóng Mực (choáng/đuổi/vùng an toàn) → chạm → kết thúc. Nếu cùng tick vừa thắng vừa hết máu thì **ưu tiên thắng** |
| A11 | Snapshot | Chỉ ghi ở tick là bội số của `--snapshot-every`. Game kết thúc giữa chừng thì dòng `end` là dòng cuối. Có kèm mảng `motes` (mục khuyến nghị) |
| A12 | Mặc định Đêm 1 | 5 đèn L1–L5 cách đều trên vòng tròn bán kính 22 m (L1 ở +Z). 20 đom đóm ngẫu nhiên lúc đầu, mỗi 3 s sinh thêm 1 (tối đa 24). Bóng Mực đầu tiên ở giây 10, sau đó mỗi 25 s một con (tối đa 4 con cùng lúc), xuất hiện trên vòng bán kính 38 m. Tâm Bóng Mực ở y = 1 |
| A13 | Scenario | `random_motes`/`random_shades` vắng mặt thì mặc định `true`. Mote/shade không có id thì tự sinh `M1…`/`S1…` (bỏ qua id đã dùng). `deposited ≥ lantern_cost` lúc dựng thì đèn coi như đã thắp (không cộng điểm). Đèn có id ngoài L1–L5 bị coi là sai định dạng (mã thoát 2) |
| A14 | Inputs | Thành phần `move` ngoài [−1, 1] bị kẹp về [−1, 1] rồi mới chuẩn hóa. Sai kiểu dữ liệu thì mã thoát 2. Trường `dash` bị bỏ qua |
| A15 | Mã lỗi | Tham số CLI sai hoặc thiếu → mã 1. File inputs/scenario không đọc được, JSON hỏng hoặc sai schema → mã 2 |

## 3. Tiêu chí nghiệm thu và truy vết

Trạng thái lấy từ lần chạy `bash scripts/verify.sh phase-1` ghi trong [SUMMARY.md](../proof/phase-1/SUMMARY.md).

| ID | Yêu cầu | Tiêu chí nghiệm thu | Test / scenario | Bằng chứng | Trạng thái |
|---|---|---|---|---|---|
| C1 | `game.contract.json` | Đủ khóa, đúng kiểu, `lantern_count_night1` = 5, core dùng chính file này | `core.test.ts › C1` | unit-and-scenario-tests.log | PASS |
| C2 | Tham số CLI, mã thoát | 0 khi OK; 2 khi JSON hỏng, tick không tăng, scenario sai; khác 0 kèm stderr khi `--night 2`; stdout trống | `headless.test.ts › C2`, `core.test.ts › C2` | unit-and-scenario-tests.log | PASS |
| C3 | Mô hình tick | Snapshot 0 trước input; đúng N bước; sự kiện ghi tick k+1; `time_left_s` = thời lượng − bước/60 | fixture 01, `core › C3` | scenarios/01-contract-example | PASS |
| C4 | Schema JSONL | Mọi dòng đúng schema, dữ liệu event đúng khóa, tọa độ 3 chữ số, `end` là dòng cuối | `checkSchema` chạy trên cả 10 fixture | scenarios/*/output.jsonl | PASS |
| C5 | Di chuyển, camera, nhảy | 6 m/s; yaw 90° xoay đúng công thức; vector dài hơn 1 được chuẩn hóa; nhảy rồi đáp về y = 0; không ra khỏi đảo | fixture 10, `core › C5` | scenarios/10-camera-yaw | PASS |
| C6 | Nhặt, nạp, thắp | Nhặt ở đúng ≤ 1.5 m; giới hạn 10; deposit/lantern_lit; điểm +10/+100 | fixture 01, 02, `core › C6` | scenarios/02-collect-and-light | PASS |
| C7 | Tỏa sáng | Trừ 2; choáng ≤ 6 m; đẩy 4 m; choáng đúng 180 tick; cooldown 90 tick; +25 | fixture 03, `core › C7` | scenarios/03-pulse-stun | PASS |
| C8 | Bị chạm | −1 flame, rơi floor(50%), bất tử 120 tick | fixture 04, 07, `core › C8` | scenarios/04-hit-and-drop | PASS |
| C9 | Bóng Mực sợ đèn | Không vào trong 6 m quanh đèn đã thắp; dựng scenario không cộng điểm | fixture 08, `core › C9` | scenarios/08-safe-zone | PASS |
| C10 | Thắng / thua | `all_lit` kèm điểm thưởng (549); `dawn` ở tick 120; `no_flames`; dừng sớm | fixture 05, 06, 07, 09 | scenarios/05…07, 09 | PASS |
| C11 | Tất định | Hai lần chạy (6000 tick, có input) cho SHA-256 giống nhau; id tự sinh ổn định | `verify.sh › determinism`, `headless › C11` | determinism.log | PASS |
| C12 | Game 3D chơi được | Đi, nhảy, camera, nhặt, nạp, tỏa sáng, HUD, thắng/thua, chơi lại | Chơi thử thủ công | Cần ảnh chụp từ người chơi | **NOT VERIFIED** (máy không có trình duyệt tự động; build web PASS) |
| C13 | README tối đa 3 lệnh | `npm ci`, `npm run build`, `npm start` | Clone sạch rồi chạy | clean-clone.log | xem mục 5 |
| H1 | Harness | Stop hook chặn khi test đỏ | Cố ý làm sai `player_speed` | hook-gate-check.log | PASS |

## 4. Đánh giá Phase 1

Mục này được cập nhật sau lần kiểm chứng cuối của phase.

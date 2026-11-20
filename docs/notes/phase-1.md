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
| A6 | `safe_radius` | Chỉ áp cho đèn **đã thắp** ("Bóng Mực sợ những chiếc đèn"; đèn tắt không có ánh sáng). Bóng Mực bị đẩy ra `safe_radius + 0.001` (nằm hẳn ngoài, vì "trong bán kính" là ≤ r) |
| A7 | Bị chạm | Bóng Mực không choáng ở ≤ `shade_hit_radius`: trừ 1 flame, `dropped = floor(carried × hit_drop_ratio)` (số này biến mất, không rơi xuống đất), bất tử `invuln_s` giây. Mỗi tick tối đa 1 lần chạm |
| A8 | Rơi khỏi đảo | `fall_enabled: false`: **không có biên** trong core. Ra ngoài đảo (bán kính 40 m, chỉ là hình) thì Mây đi trên biển mây, không bị phạt. *Đã đổi sau review:* bản đầu giữ người chơi trong 40 m, khiến `player.pos` lệch khỏi `player_speed × t` mà contract không cho phép |
| A9 | Điểm khi thắng | Cộng `per_second_left × floor(time_left_s)` và `per_flame_left × flames` lúc thắng; thua thì không có thưởng |
| A10 | Thứ tự trong một bước | cạnh nút → di chuyển + nhảy → nhặt → nạp/thắp → pulse → sinh thực thể → Bóng Mực (choáng/đuổi/vùng an toàn) → chạm → kết thúc. Nếu cùng tick vừa thắng vừa hết máu thì **ưu tiên thắng** |
| A11 | Snapshot | Chỉ ghi ở tick là bội số của `--snapshot-every`. Game kết thúc giữa chừng thì dòng `end` là dòng cuối. Có kèm mảng `motes` (mục khuyến nghị) |
| A12 | Mặc định Đêm 1 | 5 đèn L1–L5 cách đều trên vòng tròn bán kính 22 m (L1 ở +Z). 20 đom đóm ngẫu nhiên lúc đầu, mỗi 3 s sinh thêm 1 (tối đa 24). Bóng Mực đầu tiên ở giây 10, sau đó mỗi 25 s một con (tối đa 4 con cùng lúc), xuất hiện trên vòng bán kính 38 m. Tâm Bóng Mực ở y = 1 |
| A13 | Scenario | `random_motes`/`random_shades` vắng mặt thì mặc định `true`. Mote/shade không có id (kể cả đom đóm sinh thêm) thì tự sinh `M<n>`/`S<n>`, bỏ qua id đã dùng. `deposited ≥ lantern_cost` lúc dựng thì đèn coi như đã thắp (không cộng điểm). Nếu dựng sẵn cả 5 đèn đã thắp, game thắng ở bước 1 (tick 1) kèm điểm thưởng: lúc dựng không cộng điểm, chiến thắng là sự kiện của gameplay. Đèn có id ngoài L1–L5 bị coi là sai định dạng (mã thoát 2) |
| A14 | Inputs | `move` có độ dài lớn hơn 1 thì chuẩn hóa nguyên vector (giữ hướng, không kẹp từng thành phần). Sai kiểu dữ liệu thì mã thoát 2. Trường `dash` bị bỏ qua |
| A15 | Mã lỗi | Tham số CLI sai hoặc thiếu → mã 1. File inputs/scenario không đọc được, JSON hỏng hoặc sai schema → mã 2 |

## 3. Tiêu chí nghiệm thu và truy vết

Trạng thái lấy từ lần chạy `bash scripts/verify.sh phase-1` ghi trong [SUMMARY.md](../proof/phase-1/SUMMARY.md).

| ID | Yêu cầu | Tiêu chí nghiệm thu | Test / scenario | Bằng chứng | Trạng thái |
|---|---|---|---|---|---|
| C1 | `game.contract.json` | Đủ khóa, đúng kiểu, `lantern_count_night1` = 5, core dùng chính file này | `core.test.ts › C1` | unit-and-scenario-tests.log | PASS |
| C2 | Tham số CLI, mã thoát | 0 khi OK; 2 khi JSON hỏng, tick không tăng, scenario sai; khác 0 kèm stderr khi `--night 2`; stdout trống | `headless.test.ts › C2`, `core.test.ts › C2` | unit-and-scenario-tests.log | PASS |
| C3 | Mô hình tick | Snapshot 0 trước input; đúng N bước; sự kiện ghi tick k+1; `time_left_s` = thời lượng − bước/60 | fixture 01, `core › C3` | scenarios/01-contract-example | PASS |
| C4 | Schema JSONL | Mọi dòng đúng schema, dữ liệu event đúng khóa, tọa độ 3 chữ số, `end` là dòng cuối | `checkSchema` chạy trên cả 10 fixture | scenarios/*/output.jsonl | PASS |
| C5 | Di chuyển, camera, nhảy | 6 m/s; yaw 90° xoay đúng công thức; vector dài hơn 1 được chuẩn hóa; nhảy rồi đáp về y = 0; không có biên (10 s đi được 60 m) | fixture 10, 15, `core › C5` | scenarios/10-camera-yaw, 15-no-world-boundary | PASS |
| C6 | Nhặt, nạp, thắp | Nhặt ở đúng ≤ 1.5 m; giới hạn 10 (nhặt nhiều con trong một tick); deposit/lantern_lit; điểm +10/+100 | fixture 01, 02, 12, `core › C6` | scenarios/02, 12 | PASS |
| C7 | Tỏa sáng | Trừ 2; choáng ≤ 6 m; đẩy đủ 4 m (cả khi sát rìa đảo); choáng đúng 180 tick; cooldown 90 tick; +25; không trúng ai vẫn ghi `stunned_ids: []` | fixture 03, 11, `core › C7` | scenarios/03, 11 | PASS |
| C8 | Bị chạm | −1 flame, rơi floor(50%), bất tử 120 tick; nhiều Bóng Mực cùng lúc chỉ tính 1 lần chạm mỗi tick | fixture 04, 07, 14, `core › C8` | scenarios/04, 14 | PASS |
| C9 | Bóng Mực sợ đèn | Không vào trong 6 m quanh đèn đã thắp; dựng scenario không cộng điểm | fixture 08, `core › C9` | scenarios/08-safe-zone | PASS |
| C10 | Thắng / thua | `all_lit` kèm điểm thưởng (549); `dawn` ở tick 120; `no_flames`; dừng sớm | fixture 05, 06, 07, 09 | scenarios/05…07, 09 | PASS |
| C11 | Tất định | Hai lần chạy (6000 tick, có input) cho SHA-256 giống nhau; id tự sinh ổn định, không trùng id có sẵn | `verify.sh › determinism`, `headless › C11`, fixture 13 | determinism.log, scenarios/13 | PASS |
| C12 | Game 3D chơi được | Đi, nhảy, camera, nhặt, nạp, tỏa sáng, HUD, thắng/thua, chơi lại | Chơi thử thủ công | Cần ảnh chụp từ người chơi | **NOT VERIFIED** (máy không có trình duyệt tự động; build web PASS) |
| C13 | README tối đa 3 lệnh | `npm ci`, `npm run build`, `npm start` | Clone sạch rồi chạy | clean-clone.log | PASS (build, headless, HTTP 200; phần hiển thị xem C12) |
| H1 | Harness | Stop hook chặn khi test đỏ | Cố ý làm sai `player_speed` | hook-gate-check.log | PASS |
| H2 | Review độc lập | Subagent không viết code rà contract, chạy khoảng 25 ca biên | Báo cáo reviewer (mục 4) | ai-usage.md | PASS: 1 MAJOR + 5 minor, đã xử lý |
| E1 | Hiệu năng headless (chưa có ngưỡng ở Phase 1) | Một đêm 300 s (18 000 tick) chạy dưới 1 s | `/usr/bin/time` | perf-sample.log | 0.04 s |

## 4. Đánh giá Phase 1

**Đạt:** toàn bộ yêu cầu logic của PRD-0 và mọi điều khoản của Test Contract v1.0 đều có test chạy qua CLI thật (15 fixture với kỳ vọng tính bằng tay, 51 test) và đều PASS. Build sạch từ clone mới. Stop hook đã được thử bằng cách cố ý làm hỏng.

**Chưa kiểm chứng:** phần hiển thị 3D (C12: camera, HUD, hiệu ứng, chơi lại). Máy không có trình duyệt tự động, nên cần người chơi thử và chụp ảnh vào `docs/proof/phase-1/screenshots/`. Build web đã PASS và `vite preview` trả HTTP 200.

**Review độc lập (subagent, chỉ đọc):** không có lỗi critical. Các phát hiện và cách xử lý:

| # | Mức | Phát hiện | Xử lý |
|---|---|---|---|
| 1 | MAJOR | Giới hạn đảo 40 m không có trong contract làm lệch vị trí (đi thẳng 10 s ra 40 m thay vì 60 m; đẩy lùi ở rìa chỉ được 2 m) | Bỏ giới hạn trong core. A8 sửa lại. Thêm fixture 15 và unit test |
| 2 | minor | Đom đóm sinh thêm có thể trùng id `M1` với đom đóm của scenario | Sinh id bỏ qua id đã dùng. Thêm fixture 13 |
| 3 | minor | Dựng sẵn 5 đèn đã thắp thì thắng ở tick 1 kèm điểm thưởng | Giữ nguyên, ghi rõ trong A13 |
| 4 | minor | Bóng Mực có thể đứng đúng trên biên `safe_radius` (≤ r nghĩa là vẫn "trong") | Đẩy ra r + 0.001 |
| 5 | minor | `move` bị kẹp từng thành phần trước khi chuẩn hóa | Chuẩn hóa nguyên vector. Có unit test |
| 6 | minor | Test còn yếu: mảng bỏ qua phần tử thừa, test "missing args" không thiếu tham số nào, thiếu 4 ca biên | So khớp mảng đúng độ dài, thêm `event_counts`, test thiếu từng tham số, thêm fixture 11–14 |

**Hỏng phase trước?** Không áp dụng (Phase 1 là phase đầu). Các thay đổi sau review chỉ làm 2 fixture cũ đổi kỳ vọng, cả hai đều có lý do: fixture 03 phải liệt kê đủ cả 2 Bóng Mực vì giờ so khớp mảng đúng độ dài; fixture 08 đổi z = 19 thành 18.999 vì biên an toàn mới.

**Cần chỉnh cho Phase 2:**
- Fixture vẫn ghi số cứng từ tuning, nên ticket nào đổi tuning thì phải tính lại kỳ vọng.
- Nên hỏi trợ giảng để xác nhận A3 (pulse tốn đom đóm), A6 (vùng an toàn chỉ áp cho đèn đã thắp) và A7 (đom đóm rơi thì biến mất).

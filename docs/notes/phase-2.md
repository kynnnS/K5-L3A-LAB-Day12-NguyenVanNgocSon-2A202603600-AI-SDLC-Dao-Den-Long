# Phase 2: Ticket-02 "Ba hòn đảo" (Contract v1.1)

Yêu cầu gốc: [../requirements/TICKET-02.md](../requirements/TICKET-02.md), trên nền [PRD-0](../requirements/PRD-0.md). Bằng chứng: [../proof/phase-2/](../proof/phase-2/).

## 1. Change Impact Analysis

| Phase 1 (giả định cũ) | Ticket-02 | Thay đổi trong code / test | Lý do |
|---|---|---|---|
| A8: không có biên | Đảo có mép, Y < −10 là rơi, chờ 60 tick rồi hồi sinh | `maps.groundHeight`, `movePlayer` (rơi, hồi sinh); `fall_enabled: true`. Fixture 15 cũ (`no-world-boundary`) được **thay** bằng `15-fall-respawn` | Ticket thay thế luật |
| Tuning tự chọn (đèn 5, nhặt 1.5 m, nạp 2.5 m, pulse 2/6 m/3 s…) | Số chuẩn | `game.contract.json` v1.1; mọi fixture được **tính lại bằng tay** (ví dụ fixture 01 nhặt ở tick 40 thay vì 35) | Ticket thay thế số |
| +10 điểm khi nhặt | +10 điểm khi **nạp** vào đèn; +5/stun; khi thắng + giây×2 | Điểm chuyển sang bước 5 (đèn); fixture 05: 549 → 948 | Ticket thay thế |
| A3: pulse 2D, đẩy tức thì | Pulse 3D (tâm = chân + 0.8 m), đẩy 4 m trải trong 15 tick, dừng ở vật cản | Bước 7 và bước 8 (đẩy theo tick) | Ticket thay thế |
| A7: đom đóm rơi biến mất | Đom đóm rơi nằm trên vành 1.5–2.5 m, TTL 480, nhặt lại được | `dropMotes`, kind `dropped` | Ticket thay thế |
| Trạng thái `chase`/`stunned` | `spawning`/`wander`/`chase`/`recoil`/`stunned`, phát hiện 12 m, bỏ đuổi 18 m | State machine trong `moveShade` | Ticket thay thế |
| A10: ưu tiên **thắng** cùng tick | Ưu tiên **no_flames**, rồi all_lit (kể cả đúng tick hết giờ), rồi dawn | Bước 11 | Ticket thay thế |
| Thứ tự trong tick tự chọn | 12 bước bắt buộc + pause | Viết lại `step()` | Ticket thay thế |
| Bóng Mực tự sinh theo lịch tự chọn | Tick 300 sinh 2 con, rồi mỗi 480/420/360 tick; điểm chuẩn ≥ 15 m | `spawn()` | Ticket thay thế |
| Đom đóm ngẫu nhiên trên đảo | 20 con ở 20 điểm chuẩn; +1 mỗi 240 tick vào điểm trống; trần 30 | `spawn()`, `Mote.point` | Ticket thay thế |
| 1 Đêm | 3 bản đồ chuẩn | `maps.ts` là **nguồn chung** cho mô phỏng và hình vẽ | Mới |
| — | Lướt, Gió Lạc, Bùa Gió, gió mạnh, pause | Core + fixture riêng cho từng tính năng | Mới |
| Contract v1.0 | v1.1: thêm trường snapshot, scenario, input, sự kiện | `output.ts`, `spec.ts`, CLI `--night 1..3` | Mới |

Phần **giữ nguyên** từ Phase 1: mô hình tick (snapshot 0, sự kiện ghi tick k+1, `--ticks N`), mã thoát 0/1/2, làm tròn 3 chữ số, tất định theo seed, ngữ nghĩa scenario v1.0 (thay danh sách, `lit: true` không cộng điểm), tuning đọc từ contract, kiến trúc core/headless/client.

## 2. Giả định cho chỗ Ticket-02 chưa nói rõ

| # | Chỗ chưa rõ | Giả định |
|---|---|---|
| B1 | "Tăng tốc/dừng ≤ 0.1 s" | Đổi vận tốc **tức thì** (0 s vẫn thỏa ≤ 0.1 s). Giữ đúng `speed × t` mà test Phase 1 có thể kiểm |
| B2 | Thời gian spawning; cách wander | spawning kéo dài 60 tick: không di chuyển, không gây hit, không bị pulse. wander đi 2 m/s tới điểm ngẫu nhiên có seed cách 3–8 m |
| B3 | "Chênh cao ≤ 1.5 m" khi chạm | So `|player.y − shade.y|` (chân Mây với tâm Bóng Mực). Tâm Bóng Mực ở mặt đất + 1 m. Bóng Mực đặt bằng scenario cũng được đưa về mặt đất + 1 m ngay khi tạo (ví dụ PRD ghi `y = 0`) |
| B4 | `score` khi thua | Dòng `end`/snapshot vẫn ghi điểm đã tích lũy trong Đêm. Tổng điểm chuỗi 3 Đêm (chỉ cộng Đêm thắng) tính ở client |
| B5 | Tick của `night_start` | Ghi một lần ở tick 0, ngay sau snapshot 0 |
| B6 | Kiểu dữ liệu chưa rõ | `invuln` là boolean; `wind.dir_deg` là `null` khi không có gió; `ttl_s` là `null` với đom đóm thường; `charms.respawn_s` là 0 khi bùa đang có |
| B7 | Pause | Bấm `pause` để bật/tắt. Tick bấm tạm dừng dừng ở bước 1; tick bấm tiếp tục chạy bình thường. Trạng thái nút vẫn cập nhật trong lúc dừng |
| B8 | "Vật cản" khi đẩy lùi | Mép đảo, tháp chuông, vùng an toàn của đèn đã sáng. Bóng Mực lướt theo địa hình, vách tầng không chặn |
| B9 | "Đẩy ra mép trong tối đa 30 tick" | Đẩy ra 0.2 m/tick (6 m ÷ 30); trong lúc đó Bóng Mực không tự di chuyển và vô hại. Bóng bị chặn ở mép đứng ở r + 0.001 |
| B10 | Gió | Cơn gió bắt đầu ở sim tick 1800k, kéo dài 300 tick; hướng chọn ngẫu nhiên có seed lúc bắt đầu, góc đo từ +X về +Z |
| B11 | Gió Lạc | Bị loại bỏ thì xóa khỏi mảng `drifters`. Điểm sinh dùng điểm sinh của Bóng Mực. Chỉ con đang `chase` mới cướp. Pulse trúng con đang `idle` thì không có tác dụng. Gió Lạc bay (không bị mép đảo/vách/vùng an toàn chặn) |
| B12 | Điểm xuất phát Đêm 2/3 | Đêm 2: (0,0,0). Đêm 3: (0,0,−30), vì (0,0,0) nằm trong tháp chuông. Hướng mặt ban đầu là +Z |
| B13 | Lướt khi đang được bục nhảy phóng | Lướt ghi đè vận tốc ngang trong 12 tick và giữ độ cao. Sau đó vận tốc phóng tiếp tục cho tới khi chạm đất |
| B14 | Đom đóm rơi ở chỗ không có mặt đất | Lấy độ cao mặt đất tại điểm đó; nếu không có mặt đất thì dùng độ cao của Mây (đom đóm có thể nằm trên biển mây, không nhặt được: hạn chế đã biết) |
| B15 | "Hướng đang di chuyển" khi lướt | Đang được bục nhảy phóng thì lướt theo hướng vận tốc phóng; ngoài ra theo hướng phím (đổi tức thì, B1); đứng yên thì theo hướng mặt |
| B16 | `move` có thành phần ngoài [−1, 1] | Chấp nhận và chuẩn hóa về độ dài 1 (không coi là file lỗi) |
| B17 | Dòng `end` khi lần chạy dừng lúc đang tạm dừng | PRD chỉ cho `playing`/`won`/`lost` ở dòng `end`, nên ghi `playing`; snapshot vẫn ghi `paused` |
| B18 | "Điểm trống" khi sinh đom đóm | Điểm chuẩn bị chiếm nếu có bất kỳ đom đóm nào (thường, từ scenario hay rơi) đứng trên nó (XZ ≤ 10⁻⁶ m) |
| B19 | Đẩy lùi "dừng nếu gặp vật cản" | Dừng **đúng tại** vật cản (chia đôi bước để tìm phần đi được), không dừng sớm cả bước |

## 3. Acceptance criteria cho từng mục Phần 3

| Mục | Tiêu chí nghiệm thu (kiểm được) | Cách kiểm |
|---|---|---|
| **Gió Lạc** | (a) Chỉ sinh ở Đêm 2/3, tại sim tick 1200k, tối đa 2 con, id D1, D2… (b) `idle` → `chase` khi Mây mang ≥ 5 đom đóm và cách ≤ 15 m; mất điều kiện thì về `idle`. (c) Chạm (XZ ≤ 1.2 m) thì cướp min(3, mang), phát `drifter_steal`, chuyển `flee`, bị xóa sau 240 tick; mỗi con cướp một lần. (d) Cướp xảy ra **trước** Bóng Mực gây hit trong cùng tick. (e) Pulse trúng con `chase` → `flee`, không cướp. Pulse trúng con `flee` có đồ → thả toàn bộ thành đom đóm rơi tại chỗ, phát `drifter_drop`, bị xóa sau 120 tick. (f) Không làm mất Ngọn Lửa; bất tử không chặn cướp | unit T11, fixture 19, 20 |
| **Bùa Gió** | (a) C1 ở (35,0,0) Đêm 2; C1/C2 ở (±30,0,25) Đêm 3. (b) Nhặt như đom đóm → `charm_picked {charm_id, charm_ticks: 600}`. (c) Trong 600 tick: chạy 7.2 m/s; lướt không hồi chiêu nhưng vẫn phải bấm lại, và bấm khi đang lướt bị bỏ qua. (d) Nhặt lại làm mới thời gian. (e) Xuất hiện lại sau 2700 tick | unit T12, fixture 18 |
| **Chuỗi 3 Đêm** | Menu → giới thiệu Đêm (tên đảo, lời Ông Đăng) → chơi → kết quả. Thắng thì sang Đêm kế; thắng Đêm 3 thì màn Bình Minh hiện tổng điểm (chỉ cộng Đêm thắng, chơi lại không cộng trùng). Thua thì chơi lại Đêm đó. Mỗi Đêm hồi đầy 3 Ngọn Lửa | Thủ công (C12-2); core: `createGame` đặt `flames = 3` mỗi Đêm |
| **Tạm dừng** | Esc/P (cạnh false→true) dừng logic hoàn toàn: tick vẫn tăng; sim_tick, thời gian, hồi chiêu, spawn, TTL đứng yên; snapshot `state: "paused"`; có sự kiện `paused`/`resumed`. Menu có Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu | unit T10, fixture 22; menu: thủ công |
| **Cài đặt** | Thanh trượt âm lượng và độ nhạy chuột; lưu vào `localStorage` và còn sau khi mở lại game | Thủ công (mở lại trang) |
| **Âm thanh** | Có nhạc nền và hiệu ứng cho: nhặt, thắp đèn, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s cuối, cảnh báo gió | Thủ công (nghe); code `audio.ts` + móc sự kiện trong `main.ts` |
| **HUD** | Ngọn Lửa trên trái; mm:ss trên giữa (đỏ, nhấp nháy khi ≤ 30 s); đèn k/n và điểm trên phải; thanh đom đóm 10 ô dưới giữa; biểu tượng hồi chiêu Lướt/Tỏa Sáng dưới phải; nhắc "E — Nạp ánh sáng (x/10)"; mũi tên chỉ đèn chưa sáng gần nhất khi nó ở ngoài màn hình | Thủ công + ảnh chụp |
| **Bảng màu** | Các thành phần được liệt kê dùng đúng mã HEX (`PAL` trong `models.ts`, biến CSS), sai lệch ≤ 10%/kênh | Đọc code (`PAL` khớp nguyên mã HEX) |
| **Ánh sáng môi trường** | Cường độ = 0.15 + 0.55 × (đèn sáng / tổng đèn) | Đọc code (`main.ts › sync`) |
| **Gió mạnh (Đêm 3)** | Cứ 30 s có một cơn gió 5 s, đẩy 2 m/s theo hướng ngẫu nhiên có seed; báo trước 2 s bằng lá bay và âm thanh | unit T13, fixture 21 (dịch chuyển đúng 10 m); cảnh báo: thủ công |

## 4. Ma trận truy vết

Trạng thái lấy từ [SUMMARY.md](../proof/phase-2/SUMMARY.md) (`bash scripts/verify.sh phase-2` tại commit de880e4: 6/6 PASS, 77/77 test). Bằng chứng từng fixture: [../proof/phase-2/scenarios/](../proof/phase-2/scenarios/README.md).

| Yêu cầu Ticket-02 | Test / fixture | Bằng chứng | Trạng thái |
|---|---|---|---|
| P1 số chuẩn (di chuyển, nhảy, nhặt 1 m, nạp 2 m, đèn 10) | unit T1–T3, fixture 01, 02, 10, 12 | scenarios/01, 02, 10, 12 | PASS |
| P1 Tỏa Sáng 3D, đẩy 4 m trong 15 tick, choáng 2 s | unit T5, fixture 03, 11 | scenarios/03, 11 | PASS |
| P1 bị đánh: rơi đom đóm, bất tử 90 tick, recoil | unit T6, fixture 04, 07, 14 | scenarios/04, 07, 14 | PASS |
| P1 vùng an toàn 6 m, đẩy ra ≤ 30 tick | unit T7, fixture 08 | scenarios/08 | PASS |
| P1 sinh Bóng Mực / đom đóm theo lịch | unit T8, fixture 09, 13 | scenarios/09, 13 | PASS |
| P1 thắng/thua, thứ tự ưu tiên, điểm | unit T9, fixture 05, 06, 07 | scenarios/05, 06, 07 | PASS |
| P1 rơi khỏi đảo, hồi sinh | unit, fixture 15, 28 | scenarios/15, 28 | PASS |
| P1 thứ tự 12 bước trong tick | unit (cướp trước hit), fixture 19 | scenarios/19 | PASS |
| P2 bản đồ Đêm 2 (cầu, bục nhảy, Đảo B) | fixture 18, 23, 27, 28 | scenarios/18, 23, 27, 28 | PASS |
| P2 bản đồ Đêm 3 (tầng, dốc, vách, bục) | fixture 21, 24, 25, 26 | scenarios/21, 24–26 | PASS |
| P3 Lướt | unit, fixture 16, 17 | scenarios/16, 17 | PASS |
| P3 Gió Lạc | unit T11, fixture 19, 20 | scenarios/19, 20 | PASS |
| P3 Bùa Gió | unit T12, fixture 18 | scenarios/18 | PASS |
| P3 Tạm dừng (logic) | unit T10, fixture 22 | scenarios/22 | PASS |
| P3 Gió mạnh Đêm 3 (logic, đẩy 10 m) | unit T13, fixture 21 | scenarios/21 | PASS |
| Contract v1.1: CLI `--night`, mã thoát, schema snapshot/sự kiện | headless.test.ts (exit code, schema) | unit-and-scenario-tests.log | PASS |
| Tất định 3 Đêm | verify.sh `determinism` | determinism.log | PASS |
| Hiệu năng: 21 600 tick ≤ 30 s mỗi Đêm | verify.sh `performance` (87 / 104 / 134 ms, Apple M5) | performance.log | PASS |
| P3 Chuỗi 3 Đêm, menu tạm dừng, Cài đặt (localStorage), âm thanh, HUD, cảnh báo gió | Chơi thủ công | Chưa có ảnh chụp | NOT VERIFIED |
| Bảng màu HEX, ánh sáng môi trường | Đọc code (`PAL`, `main.ts`) | — | PASS (đọc code), hình ảnh NOT VERIFIED |
| FPS ≥ 30 ở 1280×720 | Đồng hồ FPS trong game | Chưa đo | NOT VERIFIED |

## 5. Đánh giá Phase 2

- **Đạt:** mọi yêu cầu kiểm được bằng headless đều có test hoặc fixture tính tay và PASS qua CLI thật. Tất định và hiệu năng đạt với biên rất rộng (khoảng 0.13 s so với ngưỡng 30 s).
- **Chưa kiểm:** phần giao diện (chuỗi Đêm, menu, cài đặt, âm thanh, HUD, FPS) chỉ kiểm được bằng tay. Máy làm lab không có công cụ tự động hóa trình duyệt, nên các mục này để NOT VERIFIED cho tới khi có ảnh chụp trong `docs/proof/phase-2/screenshots/`.
- **Review độc lập** (agent reviewer chạy CLI thật, không sửa file, 152 934 token): không có lỗi nghiêm trọng, 1 lỗi lớn, 8 lỗi nhỏ. Tất cả được xử lý **trước** khi gắn tag `phase-2`:

| # | Phát hiện | Xử lý | Test |
|---|---|---|---|
| M1 | Sinh đom đóm không coi đom đóm scenario/rơi là đã chiếm điểm, nên sinh chồng lên và phá luật "hết điểm trống thì bỏ lượt" | Sửa (B18) | unit "mote respawn skips points occupied…" |
| m1 | Bóng Mực scenario `y = 0` giữ nguyên tới lần di chuyển đầu, làm Tỏa Sáng lệch 0.8 m chiều cao | Sửa (B3) | unit "scenario shade at y = 0…" |
| m2 | Dòng `end` có thể ghi `paused` | Sửa (B17) | unit "end record never says paused" |
| m3 | Đẩy lùi dừng sớm tới 0.267 m trước vật cản | Sửa (B19); test cũ 39.8 m đổi thành 40 m có ghi lý do | unit "knock-back stops at…" (mép đảo, vùng an toàn) |
| m4 | Bóng Mực scenario ở `recoil` chỉ đi 59 tick | Sửa: mặc định 60 + 1 như khi gây hit | unit "scenario shade in recoil…" |
| m5 | Lướt khi đang bị phóng dùng hướng phím | Sửa (B15) | unit "dash during a pad launch…" |
| m6 | `move` ngoài [−1, 1] không báo lỗi | Ghi giả định B16 | — |
| m7 | Bóng Mực đuổi không trượt quanh vật cản (kẹt ở tháp/mép) | Hạn chế đã biết, ticket không yêu cầu | — |
| m8 | Đom đóm rơi có thể nằm trên biển mây | Hạn chế đã biết (B14) | — |
- **Bài học:** hàm mẫu của test tắt mọi thứ, kể cả gió. Các phép tính off-by-one (recoil 60 + 1, tick k + 1) phải tính tay trước khi viết test. Cả hai đã ghi vào `CLAUDE.md`.

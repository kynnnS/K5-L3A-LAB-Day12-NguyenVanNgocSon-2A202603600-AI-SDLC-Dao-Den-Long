# Phase 3: Ticket-03 "Đèn cạn dầu" (Contract v1.2)

Yêu cầu gốc: [../requirements/TICKET-03.md](../requirements/TICKET-03.md) (thay một số luật của [TICKET-02](../requirements/TICKET-02.md) và [PRD-0](../requirements/PRD-0.md)). Quyết định thiết kế: [ADR-003](../architecture/ADR-003-lantern-fuel-and-dawn-survival.md). Thay đổi phá vỡ tương thích: [CHANGELOG.md](../../CHANGELOG.md). Bằng chứng: [../proof/phase-3/](../proof/phase-3/).

**Baseline trước khi sửa:** commit `a2d154d`, `bash scripts/verify.sh phase-2-hardening` 6/6 PASS, 94/94 test ([../proof/phase-2-hardening/](../proof/phase-2-hardening/SUMMARY.md)). Tag `phase-1`, `phase-2` không bị đụng tới.

## 1. Change Impact Analysis

| Luật | Trạng thái | Ảnh hưởng code | Ảnh hưởng test |
|---|---|---|---|
| Đèn đã sáng không nhận thêm đom đóm | **Thay thế** (Ticket-03 §1): đèn có dầu, châm dầu, tắt, thắp lại | `Lantern` thêm `fuel` (đơn vị nguyên 1/60), `everLit`, `relitCount`; bước 2 trừ dầu, ngay sau bước 2 đèn tắt; bước 5 viết lại | Thêm test fuel/refuel/relight; fixture 29–31 |
| Bóng Mực không bao giờ vào vùng an toàn | **Thay thế** (§2): vùng an toàn chỉ khi dầu ≥ 30; trạng thái mới `drain` | `hasZone()`; `moveShade`: wander → đèn yếu → `drain`; chuyển trạng thái từ `drain`; bước 7 tính +15 | Test drain; fixture 32–34 |
| Thắng ngay khi tất cả đèn sáng; thời gian 300/330/360 s | **Thay thế** (§3): chỉ thắng lúc bình minh với ≥ ceil(0.6 × đèn); 240/270/300 s | Bước 11 viết lại; contract đổi thời lượng | Test bình minh 3 Đêm; fixture 35–42. **Thay** fixture 05, unit T9 |
| Sức chứa 10 cố định | **Thay thế** (§4): 10 + 2 × lần thắp thành công, tối đa 20 | `capacity()` dùng khi nhặt; `Player.successfulLights` | Test sức chứa; fixture 31, 43 |
| Công thức điểm Ticket-02 | **Thay thế** (§5) | +5/đom đóm (`per_mote` = 5), +100/+40, stun 5/15, thưởng bình minh theo dầu thật, `per_second_left` = 0 | Cập nhật fixture 02, unit T5, T9 |
| Chế độ mù màu | **Mới** (§6) | Chỉ ở client: `settings.colorblind`, CSS `body.cb`, màu Bóng Mực | Unit test lưu cài đặt |
| Contract v1.1 | **Thay thế** bởi v1.2 (§7) | `game.contract.json`, `tuning.ts`, `output.ts`, `spec.ts`, kiểu sự kiện | Unit T1, bộ kiểm schema `expect.ts` |
| Bản đồ, di chuyển, nhảy, lướt, Bùa Gió, Gió Lạc, lịch sinh, va chạm, đom đóm rơi, rơi và hồi sinh, pause, cài đặt, âm thanh | **Giữ nguyên** | Không đổi (trừ: pause giờ đóng băng cả dầu, nhờ bước 1 đã dừng sớm) | 86 test Phase 1–2 không bị ảnh hưởng vẫn PASS nguyên vẹn |

Kế hoạch theo ưu tiên (đã làm theo đúng thứ tự): P0 mô hình đèn, thứ tự tick, drain + vùng an toàn, luật bình minh, sức chứa + điểm, contract v1.2 → P1 test hồi quy, scenario, HUD, mù màu, ADR, changelog, harness, bằng chứng → P2 không làm thêm.

## 2. Giả định cho chỗ Ticket-03 chưa nói rõ

| # | Chỗ chưa rõ | Giả định |
|---|---|---|
| C1 | Biểu diễn dầu | Số nguyên đơn vị 1/60 (100 dầu = 6000). Dầu từ scenario làm tròn **xuống** tới đơn vị 1/60 (để giá trị < 30 không thành 30), chặn ở 100. Chỉ làm tròn 1 chữ số khi xuất |
| C2 | Đèn vừa thắp khi nào bắt đầu hao | Bước 2 chỉ trừ đèn đang sáng lúc đầu tick. Đèn thắp ở bước 5 bắt đầu hao từ tick sau (ở snapshot tick thắp: 100.0) |
| C3 | "fuel_drain ghi mỗi 60 tick khi đang hút" | Mỗi Bóng Mực đếm số tick đã hút kể từ lúc vào `drain`; phát ở tick hút thứ 60, 120, … Trường `fuel` là dầu sau khi trừ của tick đó (≥ 0). Phát trước `lantern_out` nếu cùng tick |
| C4 | Scenario đèn | `ever_lit` mặc định bằng `lit`. `fuel` chỉ có nghĩa khi đèn sáng (đèn tắt luôn 0). `lit: true` không có `fuel` → 100. `deposited` ≥ chi phí (10, hoặc 5 nếu `ever_lit`) thì đèn sáng như luật v1.0 |
| C5 | `deposited` của đèn đang sáng | Giữ số đã nạp (10 hoặc 5); về 0 khi đèn tắt (§1) |
| C6 | "Đèn đầy dầu" | Dầu = 100 đúng lúc bước 5. Vì bước 2 hao trước bước 5, đèn đang sáng gần như luôn "chưa đầy": bấm E ngay tick sau khi thắp sẽ dùng 1 đom đóm (ceil(0.0167/10) = 1). Đây là hệ quả trực tiếp của công thức trong ticket, giữ nguyên |
| C7 | Scenario Bóng Mực `drain` | Không có `target_lantern_id` thì hút đèn sáng gần nhất (bằng nhau → id nhỏ). Đèn mục tiêu không yếu hoặc ở xa > 2 m thì rời `drain` ngay tick 1. Snapshot không thêm `target_lantern_id` (contract không yêu cầu) |
| C8 | Tốc độ và điểm dừng khi wander tới đèn | Đi với tốc độ Bóng Mực của Đêm (4 m/s, Đêm 3 4.5 m/s), dừng khi cách đèn ≤ 2 m. Chỉ khi không còn đèn tắt hay đèn yếu mới lang thang ngẫu nhiên 2 m/s (B2) |
| C9 | Lúc chuyển wander → drain | Xét trước và sau khi di chuyển trong bước 8; con mới vào `drain` không hút trong bước 2 đã qua của tick đó |
| C10 | Ưu tiên chuyển trạng thái từ `drain` | Tỏa Sáng ở bước 7 xảy ra trước, nên con đang hút trúng Tỏa Sáng thì vào `stunned` (+15). Ở bước 8: Mây ≤ 6 m → `chase`, rồi mới xét đèn tắt / dầu ≥ 30 / cách > 2 m → `wander` (sau đó luật wander/chase thường chạy luôn trong tick) |
| C11 | Bóng Mực đang hút có gây hit không | Không: chỉ `wander`/`chase` gây hit như Ticket-02. Mây tới gần ≤ 6 m thì nó chuyển `chase` ở bước 8 và có thể gây hit ở bước 9 cùng tick |
| C12 | Đẩy ra khi châm dầu lên ≥ 30 | Dùng chung luật bước 6: Bóng Mực ở trong vùng của đèn sáng có dầu ≥ 30 bị đẩy ra trong ≤ 30 tick và vô hại; con đang `drain` trong vùng chuyển `wander` |
| C13 | Điểm thắp lại, stun khi drain, thưởng đèn lúc bình minh | Không có khóa tuning trong §7, nên là hằng số chuẩn trong `constants.ts`: 40, 15, 50. `per_mote` = 5, `per_lantern` = 100 (thắp lần đầu), `per_second_left` = 0 (bỏ thưởng thời gian) |
| C14 | Đang mang nhiều hơn sức chứa (scenario) | Giữ nguyên, chỉ chặn nhặt thêm |
| C15 | Đếm đèn lúc bình minh | Đếm sau mọi cập nhật của tick (bước 11): đèn tắt ở bước 2 hay được thắp ở bước 5 của tick bình minh đều được tính |
| C16 | `refuel.fuel` | Dầu sau khi châm, 1 chữ số thập phân |
| C17 | Nhấp nháy 1 Hz | Sáng 0.5 s, tối 0.5 s. Chỉ là hiển thị |

## 3. Acceptance criteria

| Mục Ticket-03 | Tiêu chí kiểm được | Kiểm bằng |
|---|---|---|
| §1 Dầu | Thắp → 100; hao đúng 1.0/60 tick, không sai số sau hàng nghìn tick; cạn đúng tick → một `lantern_out`, `deposited` 0, `ever_lit` giữ | unit P3-1; fixture 29 |
| §1 Châm dầu | `used = min(mang, ceil((100 − fuel)/10))`, không quá 100, không lấy quá số đang mang, +5 mỗi con; đèn đầy không được chọn, không sự kiện, không điểm; chọn gần nhất, bằng nhau id nhỏ | unit P3-1; fixture 30 |
| §1 Thắp lại | Đèn `ever_lit` cần 5; `relight: true`; `relit_count` + 1; nạp nhiều lần nhớ tiến độ | unit P3-1; fixture 31 |
| §2 Vùng an toàn | Dầu đúng 30 còn vùng; 29.9 mất vùng | unit P3-2; fixture 33 |
| §2 Chọn mục tiêu | Chỉ wander chọn đèn yếu gần nhất (bằng nhau id nhỏ), không có thì đèn tắt gần nhất; chase không đổi mục tiêu | unit P3-2 |
| §2 Drain | ≤ 2 m → `drain`, đứng yên, 5/s mỗi con, cộng dồn, cộng thêm hao 1/s; `fuel_drain` mỗi 60 tick | unit P3-2; fixture 32 |
| §2 Chuyển trạng thái | → chase (≤ 6 m), → stunned (Tỏa Sáng, +15), → wander (đèn tắt, châm ≥ 30, > 2 m); hết choáng → wander; châm ≥ 30 đẩy ra và vô hại | unit P3-2; fixture 32, 34 |
| §3 Bình minh | Thắng 3/5, 4/6, 5/7; thua 2/5, 3/6, 4/7; không thắng sớm; đèn tắt ở tick cuối được tính; hết lửa ở tick cuối → `no_flames`; không còn `all_lit` | unit P3-3; fixture 05, 35–42; bộ kiểm schema |
| §4 Sức chứa | 10; +2 mỗi lần thắp (cả thắp lại); 20 tối đa; châm dầu và đèn scenario không tính; mỗi Đêm về 10 | unit P3-4; fixture 31, 43 |
| §5 Điểm | +5, +100, +40, stun 5/15, thưởng bình minh theo dầu thật, 50/lửa, không thưởng khi thua | unit P3-1…P3-3; fixture 02, 30, 31, 34, 35–40 |
| §6 Mù màu | Cài đặt được lưu; viền/mắt Bóng Mực #00B3FF; cảnh báo #FFFFFF + ⚠; đèn tắt xẹp 20% + rách giấy; đèn yếu nhấp nháy; không ảnh hưởng headless | unit `settings.test.ts`; đọc code (`src/core` không có `colorblind`); hình ảnh: thủ công |
| §7 Contract v1.2 | Tuning mới; snapshot `fuel`/`ever_lit`/`relit_count`/`capacity`; trạng thái `drain`; scenario mới; sự kiện mới; tất định | unit T1, P3-5; `expect.ts › checkSchema` trên mọi fixture; verify.sh `determinism` |

## 4. Test cũ bị luật mới làm sai (cập nhật hoặc thay, không skip)

| Test | Luật cũ | Luật mới | Xử lý |
|---|---|---|---|
| unit `T1 declares v1.1 and the exact standard tuning` | Contract v1.1, 300/330/360 s, `per_mote` 10, thưởng 2/giây | v1.2, 240/270/300 s, khóa dầu, `per_mote` 5, không thưởng thời gian | Đổi thành `declares v1.2…` với số mới |
| unit `T5 partial deposits are remembered; +10 per deposited mote` | +10 mỗi đom đóm | +5; `lantern_lit` có `relight` | Cập nhật kỳ vọng (20, 150) |
| unit `T9 last lantern lit on the dawn tick -> won … all_lit` | Tất cả đèn sáng → thắng `all_lit`, + giây × 2 | Thắng chỉ lúc bình minh `dawn_survived`, thưởng 50 + floor(dầu) | **Thay** bằng `lantern lit on the dawn tick counts -> dawn_survived` (cùng tình huống) |
| unit `T10 pause freezes …` | Đêm 1 dài 300 s | 240 s | Cập nhật kỳ vọng thời gian |
| fixture `02-collect-and-light` | Điểm 200, `lantern_lit {lantern_id}` | Điểm 150, `relight: false` | Tính lại bằng tay |
| fixture `05-win-all-lit` | Thắng ngay khi thắp đèn cuối | Không còn thắng sớm | **Xóa**, thay bằng `05-all-lit-no-early-win` (cùng tình huống, kỳ vọng Đêm tiếp tục) |
| fixture `21-wind`, `22-pause` | `time_left_s` theo 360 / 300 s | 300 / 240 s | Tính lại bằng tay |

Không có test nào bị skip hay xóa mà không có test thay thế.

## 5. Ma trận truy vết

Nguồn: [SUMMARY.md](../proof/phase-3/SUMMARY.md) (`bash scripts/verify.sh phase-3` tại commit a972764: 6/6 PASS, 144/144 test). Bằng chứng từng fixture (output CLI thật): [../proof/phase-3/scenarios/](../proof/phase-3/scenarios/README.md).

| Yêu cầu Ticket-03 | Test / fixture | Bằng chứng | Trạng thái |
|---|---|---|---|
| §1 Thắp → 100, hao 1/s, không sai số | unit P3-1 (3 060 tick → đúng 2 940 đơn vị) | unit-and-scenario-tests.log | PASS |
| §1 Cạn đúng tick, `lantern_out` một lần, reset `deposited`, giữ `ever_lit` | unit P3-1, fixture 29 | scenarios/29-p3-fuel-decay-out | PASS |
| §1 Châm dầu (ceil, ≤ 100, ≤ đang mang, +5), đèn đầy không được chọn, chọn gần nhất / id nhỏ | unit P3-1, fixture 30 | scenarios/30-p3-refuel | PASS |
| §1 Thắp lại 5 đom đóm, `relight: true`, `relit_count` | unit P3-1, fixture 31 | scenarios/31-p3-relight | PASS |
| §2 Vùng an toàn: đúng 30 còn, < 30 mất | unit P3-2, fixture 33 | scenarios/33-p3-wander-to-drain | PASS |
| §2 Chọn đèn yếu (chỉ wander, gần nhất, id nhỏ), chase không đổi mục tiêu | unit P3-2 | unit-and-scenario-tests.log | PASS |
| §2 Drain 5/s, cộng dồn, `fuel_drain` mỗi 60 tick, dừng khi đèn tắt | unit P3-2, fixture 32 | scenarios/32-p3-drain-cycle | PASS |
| §2 drain → chase (≤ 6 m), → stunned (+15), → wander (châm ≥ 30 / > 2 m), đẩy ra vô hại | unit P3-2, fixture 34 | scenarios/34-p3-pulse-drain | PASS |
| §3 Thắng/thua bình minh 3/5, 4/6, 5/7 (và thiếu 1 đèn) | unit P3-3, fixture 35–40 | scenarios/35…40 | PASS |
| §3 Không thắng sớm | unit P3-3, fixture 05 | scenarios/05-all-lit-no-early-win | PASS |
| §3 Đèn cạn ở tick cuối; hết lửa ở tick cuối → `no_flames` | unit P3-3, fixture 41, 42 | scenarios/41, 42 | PASS |
| §4 Sức chứa 10 → 20, thắp lại tính, châm dầu và scenario không tính | unit P3-4, fixture 31, 43 | scenarios/43-p3-capacity-cap | PASS |
| §5 Điểm mới | unit P3-1…P3-3, fixture 02, 30, 31, 34, 35–40 | scenarios/* | PASS |
| §6 Mù màu: lưu cài đặt | `settings.test.ts` | unit-and-scenario-tests.log | PASS |
| §6 Mù màu: màu Bóng Mực, ⚠, đèn xẹp/rách, nhấp nháy | Đọc code (`main.ts › sync`, `models.ts`, `style.css`) | — | Code PASS, hình ảnh NOT VERIFIED |
| §6 Không đổi headless | `src/core` không tham chiếu `colorblind`; mọi fixture chạy qua CLI không có cài đặt | — | PASS (đọc code + fixture) |
| §7 Contract v1.2 (tuning, snapshot, scenario, sự kiện, bỏ `all_lit`) | unit T1, P3-5; `checkSchema` trên 44 fixture | unit-and-scenario-tests.log | PASS |
| Pause đóng băng dầu và hút | unit P3-5, fixture 44 | scenarios/44-p3-pause-fuel | PASS |
| Hồi quy Phase 1–2 không bị thay | 86 test cũ không đổi | unit-and-scenario-tests.log | PASS |
| Tất định 3 Đêm, hiệu năng 21 600 tick ≤ 30 s | verify.sh (89 / 113 / 147 ms, Apple M5) | determinism.log, performance.log | PASS |
| HUD dầu/sức chứa/mục tiêu, FPS ≥ 30 | Chơi thủ công | Chưa có ảnh | NOT VERIFIED |

## 6. Đánh giá Phase 3

- **Đạt:** mọi luật kiểm được bằng headless của Ticket-03 đều có test hoặc fixture tính tay và PASS qua CLI thật. Chỉ 8 test cũ đỏ, đều ở đúng chỗ luật bị thay, và đã được cập nhật hoặc thay có ghi lý do.
- **Review độc lập** (agent reviewer chạy CLI thật với tình huống tự tính tay, không sửa file, 145 443 token): không có lỗi nghiêm trọng hay lớn, 2 lỗi nhỏ, đều đã sửa **trước khi phát hành tag `phase-3`**:

| # | Phát hiện | Xử lý | Test |
|---|---|---|---|
| m1 | Bóng Mực `drain` đặt bằng scenario ở đèn còn ≥ 30 dầu hoặc cách > 2 m vẫn hút 1 tick (bước 2 chỉ kiểm `drain` + đèn sáng) | Sửa: bước 2 chỉ hút đèn yếu trong 2 m | unit "m1: a scenario drain shade at a healthy…" |
| m2 | Dầu scenario 29.995–29.999 làm tròn lên đúng 30, được vùng an toàn | Sửa C1: làm tròn **xuống** đơn vị 1/60 | unit "m2: scenario fuel just below 30…" |
| — | Ghi chú của reviewer: wander đổi so với Phase 2 (C8), `deposited` của đèn scenario là 0 (C5), luật "đèn đầy" không xảy ra với tuning chuẩn (C6) | Đã là giả định có ghi; giữ nguyên | — |
| — | Lỗ hổng test: ranh giới đúng 6.0 m, thắp lại khi Bóng Mực đang chờ trong 6 m | Thêm test | unit "drain -> chase exactly at 6.0 m", "relight with a shade waiting…" |

- **Chưa kiểm:** phần nhìn và nghe (đèn nhấp nháy, xẹp/rách, màu mù màu, HUD, FPS). Máy làm lab không cho chụp màn hình tự động.
- **Bài học:** biểu diễn dầu bằng số nguyên 1/60 giúp mọi kỳ vọng tính tay khớp chính xác ngay lần đầu (49/49 test mới PASS mà không phải chỉnh). Chạy test cũ ngay sau khi sửa core là cách nhanh nhất để thấy thay đổi đã khoanh đúng vùng.

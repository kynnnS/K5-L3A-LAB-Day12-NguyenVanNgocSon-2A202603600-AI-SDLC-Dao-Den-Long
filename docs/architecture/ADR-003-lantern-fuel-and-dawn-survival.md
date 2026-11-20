# ADR-003: Đèn có dầu và luật "sống tới bình minh"

- **Trạng thái:** Đã chấp nhận (Phase 3, Contract v1.2)
- **Ngày:** 2026-11-20
- **Liên quan:** [TICKET-03](../requirements/TICKET-03.md), [phase-3.md](../notes/phase-3.md) (giả định C1–C17), [CHANGELOG](../../CHANGELOG.md)

## Bối cảnh

Playtest cho thấy người chơi giỏi thắp hết đèn trong khoảng 2 phút rồi game kết thúc ngay (luật Ticket-02: tất cả đèn sáng → thắng). Ticket-03 đổi mục tiêu thành "giữ đảo sáng tới bình minh": đèn tiêu hao dầu và có thể tắt, Bóng Mực hút dầu đèn yếu, và chỉ xét thắng/thua lúc hết giờ.

## Mô hình cũ

`Lantern { id, pos, lit, deposited }`. Một chiều duy nhất: `deposited` tăng tới 10 thì `lit = true` và **không bao giờ đổi lại**. Vùng an toàn = `lit`. Bước 11: hết lửa → thua; tất cả `lit` → thắng (kể cả tick bình minh); hết giờ → thua.

## Mô hình mới

`Lantern { id, pos, lit, deposited, fuel, everLit, relitCount }`. Đây là một máy trạng thái nhỏ:

```
           nạp đủ 10 (lần đầu) / đủ 5 (ever_lit)
  UNLIT ───────────────────────────────────────▶ LIT (fuel = 100, ever_lit = true)
    ▲                                             │  bước 2: fuel −= 1/60 (hao) + 5/60 × số con đang drain
    │                                             │  bước 5: châm dầu (+10 mỗi đom đóm, tối đa 100)
    └──── fuel ≤ 0 ngay sau bước 2: lit = false, fuel = 0, deposited = 0, phát lantern_out
```

- Vùng an toàn chỉ tồn tại khi `lit && fuel ≥ 30` (hàm `hasZone`). Mọi chỗ trước đây hỏi `l.lit` cho vùng an toàn (chặn ở mép, đẩy ra, chặn đẩy lùi) giờ hỏi `hasZone`.
- Bóng Mực thêm trạng thái `drain` và hai trường `targetLanternId`, `drainTicks`. `wander` không còn chỉ đi ngẫu nhiên: nó nhắm đèn sáng có dầu < 30 gần nhất, không có thì đèn tắt gần nhất. Tới ≤ 2 m đèn yếu thì `drain`.
- `Player.successfulLights` quyết định sức chứa `min(20, 10 + 2 × successfulLights)`.

## Các phương án đã cân nhắc

| Vấn đề | Phương án | Kết luận |
|---|---|---|
| Biểu diễn dầu | (a) số thực, trừ 1/60 mỗi tick; (b) số nguyên đơn vị 1/60 | **(b)**. Với (a), 1/60 không biểu diễn chính xác trong nhị phân: sau 6000 tick đèn có thể còn 1e-12 dầu và tắt trễ 1 tick, phá cả "cạn đúng tick" lẫn tính tất định giữa các máy. Với (b), hao = 1 đơn vị/tick, hút = 5, mỗi đom đóm = 600, ngưỡng 30 = 1800: mọi phép so sánh đều chính xác. Chỉ chia 60 và làm tròn 1 chữ số khi xuất |
| Thêm trạng thái đèn | (a) enum `unlit/lit/out`; (b) giữ `lit` + thêm `everLit` | **(b)**. Contract v1.2 xuất đúng `lit`, `ever_lit`, `relit_count`; giữ `lit` boolean giúp mọi test và code Phase 1–2 còn hiệu lực chạy tiếp, chỉ đổi những chỗ luật đổi |
| Lúc đèn tắt | (a) ở bước 11; (b) ngay sau bước 2 | **(b)**, đúng câu chữ ticket. Hệ quả: đèn cạn ở tick bình minh không được tính khi xét thắng; Mây vẫn thắp lại kịp ở bước 5 của cùng tick (C15) |
| Đẩy Bóng Mực khi châm lên ≥ 30 | (a) code riêng trong bước 5; (b) dùng lại bước 6 "vùng an toàn" | **(b)**. Bước 6 đã đẩy mọi Bóng Mực đứng trong vùng an toàn ra mép trong ≤ 30 tick và vô hại. Vùng chỉ xuất hiện lại khi dầu ≥ 30, nên luật "như khi đèn vừa thắp" tự đúng, không nhân đôi logic (C12) |
| Thời điểm phát `fuel_drain` | (a) theo `sim_tick % 60`; (b) theo số tick mỗi con đã hút | **(b)**. "Ghi mỗi 60 tick khi đang hút" gắn với việc hút của từng con: con vào `drain` ở tick bất kỳ vẫn báo sau đúng 60 tick hút (5 dầu) (C3) |
| Số điểm 40 / 15 / 50 | (a) thêm khóa vào `score`; (b) hằng số chuẩn | **(b)**. §7 liệt kê đầy đủ khóa tuning mới và không có các số này; tự thêm khóa là đổi schema contract. `per_mote` = 5 và `per_second_left` = 0 vẫn đọc từ contract |

## Thứ tự trong tick (thay đổi)

Giữ 12 bước của Ticket-02, bổ sung:

1. Bước 2: sau các bộ đếm cũ, trừ hao cho mọi đèn đang sáng, rồi trừ hút cho từng Bóng Mực đang `drain` (theo id tăng dần), phát `fuel_drain` ở tick hút thứ 60k.
2. Ngay sau bước 2: đèn có dầu ≤ 0 tắt và phát `lantern_out`.
3. Bước 5: chọn trong các đèn "nhận được" (tắt, hoặc sáng chưa đầy); tắt → nạp để thắp (10 hoặc 5); sáng → châm dầu.
4. Bước 6: vùng an toàn theo `hasZone`; con đang `drain` bị đẩy thì về `wander`.
5. Bước 7: stun con đang `drain` được tổng 15 điểm.
6. Bước 8: luật `drain` / `wander` mới.
7. Bước 11: hết lửa → thua `no_flames` (luôn trước); hết giờ → thắng `dawn_survived` nếu số đèn sáng ≥ ceil(0.6 × tổng), kèm thưởng; ngược lại thua `dawn`. Không còn thắng sớm.

Pause vẫn dừng ở bước 1, nên dầu, hút và `fuel_drain` cùng đứng yên mà không cần code thêm.

## Ảnh hưởng tới headless và test

- Contract v1.2: snapshot thêm `lanterns[].fuel/ever_lit/relit_count`, `player.capacity`; trạng thái `drain`; scenario thêm `lit/fuel/ever_lit`, `successful_lights`, `target_lantern_id`; sự kiện `refuel`, `lantern_out`, `fuel_drain`, `lantern_lit.relight`; `game_over.reason` có `dawn_survived`, bỏ `all_lit`.
- Chỉ 8/94 test cũ đỏ sau khi đổi luật, và cả 8 đều đúng ở chỗ luật bị thay (bảng ở [phase-3.md §4](../notes/phase-3.md)). 86 test còn lại (bản đồ, di chuyển, lướt, Gió Lạc, Bùa Gió, pause, rơi, lịch sinh…) PASS nguyên vẹn, cho thấy thay đổi được khoanh đúng vùng.
- Mù màu chỉ ở client (`settings.colorblind`, CSS), không chạm `GameState`, nên không đổi đầu ra headless.

## Hệ quả và đánh đổi

- (+) Tất định và chính xác tuyệt đối cho dầu; luật vùng an toàn và đẩy ra dùng chung một chỗ.
- (+) Mọi luật chưa bị thay vẫn giữ nguyên hành vi, nên hồi quy thấp.
- (−) `wander` đổi từ "đi ngẫu nhiên" sang "đi về đèn" ở tốc độ Bóng Mực (C8) theo câu "đi về đèn tắt gần nhất như trước" của Ticket-03. Bóng Mực ở Phase 3 vì vậy tụ quanh đèn nhiều hơn Phase 2.
- (−) Vì hao ở bước 2 trước bước 5, đèn đang sáng hiếm khi "đầy" lúc tương tác: bấm E ngay sau khi thắp sẽ tốn 1 đom đóm để bù 1/60 dầu (C6). Đây là hệ quả của công thức trong ticket, client hiện nhắc "Châm dầu (99/100)" để người chơi thấy rõ.

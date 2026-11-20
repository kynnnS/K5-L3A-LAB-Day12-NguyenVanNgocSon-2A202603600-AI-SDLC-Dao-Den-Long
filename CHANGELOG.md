# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/). Mỗi phase là một tag git.

## [phase-3] — Ticket-03 "Đèn cạn dầu", Contract v1.2

### ⚠ Breaking changes

- **Contract v1.1 → v1.2.** `contract_version: "1.2"`. Tuning thêm `fuel_max` 100, `fuel_decay_per_s` 1.0, `fuel_per_mote` 10, `relight_cost` 5, `win_ratio` 0.6, `drain_per_s` 5, `low_fuel_threshold` 30, `capacity_max` 20.
- **Thời lượng Đêm** 300/330/360 s → **240/270/300 s** (`night1/2/3_duration_s`).
- **Đèn có thể cạn dầu.** Đèn vừa thắp có 100 dầu, hao 1/s; hết dầu thì tắt (`deposited` về 0, `ever_lit` giữ). Đèn đã sáng giờ **nhận** đom đóm để châm dầu.
- **Châm dầu và thắp lại.** Tương tác chọn trong các đèn tắt hoặc sáng chưa đầy. Thắp lại đèn `ever_lit` chỉ cần 5 đom đóm.
- **Vùng an toàn phụ thuộc dầu:** chỉ có khi dầu ≥ 30.
- **Bóng Mực có trạng thái mới `drain`** (hút 5 dầu/s, cộng dồn). `wander` giờ đi về đèn yếu, không có thì về đèn tắt gần nhất.
- **Bỏ thắng sớm.** Chỉ xét lúc bình minh: thắng khi số đèn sáng ≥ ceil(0.6 × tổng) (3/5, 4/6, 5/7).
- **`game_over.reason`:** thêm `dawn_survived`; **bỏ `all_lit`**.
- **Sức chứa động:** min(20, 10 + 2 × số lần thắp thành công trong Đêm).
- **Công thức điểm mới:** +5/đom đóm nạp (`per_mote` 10 → 5), +100 thắp lần đầu, +40 thắp lại, stun +5 (tổng +15 nếu đang hút), thắng: mỗi đèn sáng 50 + floor(dầu), 50/Ngọn Lửa; **bỏ thưởng thời gian** (`per_second_left` 2 → 0).
- **Schema snapshot:** `lanterns[]` thêm `fuel` (1 chữ số, 0 khi tắt), `ever_lit`, `relit_count`; `player` thêm `capacity`; `shades[].state` thêm `drain`.
- **Schema scenario:** `lanterns[]` thêm `fuel`, `ever_lit` (`lit: true` không có `fuel` → 100); `player.successful_lights`; `shades[].target_lantern_id`, `state: "drain"`.
- **Sự kiện:** mới `refuel {lantern_id, amount, fuel}`, `lantern_out {lantern_id}`, `fuel_drain {lantern_id, shade_id, fuel}` (mỗi 60 tick hút); `lantern_lit` thêm `relight`.
- **Test bị thay (có lý do):** unit T1 (contract), T5 (điểm), T9 (thắng lúc bình minh thay cho `all_lit`), T10 (thời lượng); fixture 02 (điểm, `relight`), 21 và 22 (thời gian), **05-win-all-lit → 05-all-lit-no-early-win**. Chi tiết: [docs/notes/phase-3.md §4](docs/notes/phase-3.md).

### Added

- Client: thanh dầu trên đèn; dầu < 30 thì đèn và thanh nhấp nháy 1 Hz; đèn tắt xẹp 20% và rách giấy; nhắc "Thắp lại" và "Châm dầu"; thanh đom đóm theo sức chứa (đang mang / sức chứa); HUD "đèn sáng k/n · cần m"; mục tiêu bình minh ở màn giới thiệu Đêm.
- Cài đặt **"Bảng màu dễ phân biệt"** (lưu trong `localStorage`): viền và mắt Bóng Mực #00B3FF, cảnh báo UI #FFFFFF kèm ⚠.
- 33 unit test và 16 fixture CLI (29–44) cho luật mới. [ADR-003](docs/architecture/ADR-003-lantern-fuel-and-dawn-survival.md).

### Fixed (hoàn thiện Phase 1–2, sau tag `phase-2`)

- Bóng Mực đuổi rẽ quanh tháp chuông và mép đảo; đom đóm rơi luôn nằm trên mặt đất; cảnh báo gió xét theo tick; Esc/Enter không xuyên qua hộp Cài đặt; tự tạm dừng khi rời tab.

## [phase-2] — Ticket-02 "Ba hòn đảo", Contract v1.1

- Số chuẩn, 3 bản đồ chuẩn, thứ tự 12 bước trong tick, Lướt, Gió Lạc, Bùa Gió, gió mạnh Đêm 3, tạm dừng, cài đặt, âm thanh, HUD đầy đủ. Xem [docs/notes/phase-2.md](docs/notes/phase-2.md).

## [phase-1] — PRD-0, Contract v1.0

- Đêm 1 chơi được, chế độ headless theo Test Contract v1.0, harness (CLAUDE.md, skill, Stop hook, CI). Xem [docs/notes/phase-1.md](docs/notes/phase-1.md).

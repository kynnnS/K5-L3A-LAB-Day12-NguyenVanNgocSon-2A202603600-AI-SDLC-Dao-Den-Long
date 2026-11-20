# Retro — Đảo Đèn Lồng (Day 12 AI-SDLC)

Nguyễn Văn Ngọc Sơn · 2A202603600 · Công cụ: Claude Code (Claude Opus 5.5) trong VS Code.

## 1. Số liệu cả dự án

| Phase | Yêu cầu | Test (pass/tổng) | Fixture CLI | Bằng chứng | Review độc lập |
|---|---|---|---|---|---|
| 1 | PRD-0, Contract v1.0 | 51/51 | 15 | [proof/phase-1](../proof/phase-1/SUMMARY.md) | 1 reviewer, 96 656 token, các lỗi đã sửa trước tag |
| 2 | Ticket-02, Contract v1.1 | 83/83 (tag), 94/94 (hoàn thiện sau tag) | 28 | [proof/phase-2](../proof/phase-2/SUMMARY.md), [phase-2-hardening](../proof/phase-2-hardening/SUMMARY.md) | 152 934 token: 1 lỗi lớn + 8 nhỏ, sửa trước tag |
| 3 | Ticket-03, Contract v1.2 | 148/148 | 44 | [proof/phase-3](../proof/phase-3/SUMMARY.md) | 145 443 token: 2 lỗi nhỏ, sửa trước tag |
| 4 | Ticket-04, Contract v1.3 | 159/159 | 44 | [proof/phase-4](../proof/phase-4/SUMMARY.md) | — |

Hiệu năng headless: một Đêm 21 600 tick mất 0.09–0.15 s (ngưỡng 30 s). Soak 10 Đêm: 0 crash, RSS ×1.07 (với `--jitless`; xem [phase-4.md D4](phase-4.md)).

## 2. Evaluation từng phase (tóm tắt)

- **Phase 1:** core tất định tách khỏi hiển thị ngay từ đầu, nên mọi phase sau chỉ sửa đúng chỗ luật đổi. Hỏng: không có. Chỉnh: reviewer bắt 4 lỗi (clamp 40 m, id đom đóm trùng, biên an toàn, chuẩn hóa move).
- **Phase 2:** số chuẩn + 3 bản đồ + thứ tự 12 bước. Toàn bộ fixture Phase 1 được tính lại bằng tay theo số mới, không chép output. Reviewer bắt lỗi "điểm trống" của đom đóm và đẩy lùi dừng sớm; một test cũ đã khóa nhầm hành vi sai.
- **Phase 3:** luật đèn có dầu thay luật cốt lõi. Chỉ 8/94 test cũ đỏ, đều đúng chỗ bị thay ([phase-3.md §4](phase-3.md)). 49 test mới PASS ngay lần đầu nhờ tính dầu bằng số nguyên 1/60.
- **Phase 4:** đo đạc và phát hành. Soak lộ ra RSS tăng do JIT (không phải rò rỉ); bench lộ ra rằng trình duyệt ngừng vẽ cửa sổ bị che, nên phải đo lại khi cửa sổ hiển thị.

Không phase nào làm hỏng phase trước: mỗi lần gắn tag, toàn bộ test cũ còn hiệu lực vẫn chạy trong cùng một lệnh (`npm test`).

## 3. Điều hiệu quả và không hiệu quả khi làm với AI

**Hiệu quả**
- Lưu ticket nguyên văn vào repo trước, rồi mới phân tích ảnh hưởng và viết giả định có đánh số (A1…, B1…, C1…, D1…). Agent luôn có nguồn để trích, không phải đoán.
- Kỳ vọng của fixture viết bằng công thức trong `description` rồi tính tay **trước** khi chạy. Khi test đỏ, câu hỏi luôn là "code sai hay phép tính sai?", và cả hai trường hợp đều đã xảy ra ([ai-usage.md](ai-usage.md)).
- Reviewer là một agent khác, chỉ đọc, chạy CLI thật với tình huống tự tính. Ba lần review đều tìm ra lỗi thật mà bộ test của chính tác giả bỏ sót.
- Chạy test cũ ngay sau khi đổi luật để thấy thay đổi đã khoanh đúng vùng (Phase 3: 8/94).

**Không hiệu quả**
- Test do chính agent viết đôi khi khóa đúng hành vi sai của code (đẩy lùi dừng ở 39.8 m). Chỉ review độc lập bắt được.
- Đo hiệu năng đồ họa trên máy không có công cụ tự động hóa trình duyệt và không cho chụp màn hình: phần nhìn và nghe phải để NOT VERIFIED; bench phụ thuộc cửa sổ có hiển thị hay không.
- Một số lệnh (push, tag công khai, cài thư viện từ mạng) bị hệ thống chặn, đúng với quy tắc "người xác nhận trước"; mỗi lần như vậy phải dừng chờ.

## 4. Những lần AI sai và cách phát hiện

26 lỗi được ghi kèm cách phát hiện trong [ai-usage.md](ai-usage.md). Nhóm chính:

| Nhóm | Ví dụ | Phát hiện bằng |
|---|---|---|
| Sai số học / off-by-one khi tính kỳ vọng | Recoil 59 tick; tick 120 thay vì 121; p95 và top 10 ở Phase 4 | Test đỏ → tính lại bằng tay |
| Đặt luật sai chỗ | Điểm xuất phát Đêm 3 nằm trong tháp chuông | Chạy headless cả 3 Đêm |
| Thiếu điều kiện | Đom đóm sinh chồng lên đom đóm scenario; Bóng Mực scenario `drain` vẫn hút ở đèn khỏe | Reviewer độc lập |
| Test khóa hành vi sai | Đẩy lùi 39.8 m | Reviewer độc lập |
| Môi trường | Token thiếu quyền `workflow`; RSS tăng do JIT; cửa sổ bench bị che | Lỗi khi push; đo heap và RSS; xem thời gian từng khung |

## 5. Harness nào giúp nhiều nhất

1. **`CLAUDE.md`** (cập nhật mỗi phase, lịch sử git chứng minh): nguồn sự thật, thứ tự tick, quy tắc "fixture tính tay", bài học helper `game()` tắt cả gió, luật dầu số nguyên.
2. **`scripts/verify.sh` + skill `verify-phase`**: một lệnh chạy typecheck, test, build, tất định, hiệu năng, soak, export bảng xếp hạng, và lưu bằng chứng vào `docs/proof/<phase>/` gắn với commit hash.
3. **Stop hook** (`scripts/hooks/stop-gate.sh`): chặn agent kết thúc khi test đỏ.
4. **CI** (GitHub Actions) chạy `verify.sh` mỗi lần push.
5. **Agent reviewer độc lập**: hữu ích nhất về chất lượng (3/3 lần tìm ra lỗi thật).

## 6. Token và chi phí

| Hạng mục | Số liệu | Nguồn |
|---|---|---|
| Reviewer Phase 1 / 2 / 3 | 96 656 / 152 934 / 145 443 token | Số do harness báo khi agent kết thúc |
| Phiên chính (4 phase) | **Chưa có số**: cần chạy `/cost` trong Claude Code | Extension VS Code không hiển thị bộ đếm |

Cách tiết kiệm: sinh fixture bằng một script thay vì viết tay từng file; chỉ đọc đúng hàm bị ảnh hưởng; chạy reviewer song song trong lúc viết tài liệu; không cài thêm thư viện (bench và máy chủ dùng Node thuần).

## 7. Nếu làm lại

- Chuẩn bị môi trường đo GUI ngay từ CP0 (Chrome để bench tắt được vsync, quyền chụp màn hình), để phần nhìn và nghe không phải NOT VERIFIED.
- Cấp quyền `workflow` cho token GitHub từ đầu để push được CI ngay.
- Chạy review độc lập sớm hơn trong mỗi phase (ngay sau core), không đợi cuối phase.
- Ghi số token phiên chính sau mỗi phase thay vì để tới cuối.

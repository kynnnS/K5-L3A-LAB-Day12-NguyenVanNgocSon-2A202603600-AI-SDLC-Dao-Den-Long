# Nhật ký dùng AI

Công cụ: **Claude Code** (VS Code extension), model Claude Opus 5.5. Người điều phối: Nguyễn Văn Ngọc Sơn.

## Phase 1 (PRD-0)

### Cách làm việc
1. Dùng một master prompt cố định vai trò, nguồn yêu cầu, quy tắc bằng chứng và quy tắc Git.
2. Agent làm Discovery (đọc 6 tài liệu, trích nguyên văn Test Contract từ lab board) rồi lập kế hoạch: bảng yêu cầu ↔ kiểm chứng, giả định A1–A11 và bộ tuning. **Dừng chờ duyệt.**
3. Sau khi duyệt, agent cài Node, viết core, CLI và test trước, sau đó mới làm client 3D. Mỗi bước là một commit nhỏ.
4. Kiểm chứng bằng `scripts/verify.sh`. Stop hook chặn agent kết thúc khi test đỏ. Một subagent reviewer độc lập (không phải agent đã viết code) rà soát việc tuân thủ contract.

### Lỗi thực tế của AI và cách phát hiện

| # | Lỗi | Phát hiện bằng | Cách sửa / cải tiến harness |
|---|---|---|---|
| 1 | Tính tay sai tick nhặt đom đóm trong fixture 02 (ghi 16, đúng ra là 15 vì "≤ r" tính cả biên) | Agent tự đối chiếu với fixture 01 (tick 35) trước khi chạy | Sửa kỳ vọng theo lập luận, không chép output. CLAUDE.md ghi rõ: không sửa fixture bằng cách chép output thực tế |
| 2 | Test giả định L1 ở z = 25 (lấy từ ví dụ của contract) trong khi vị trí mặc định của game là z = 22 | Test đỏ (`no deposit when out of interact_radius`, fixture 08) | Test và fixture đặt vị trí đèn tường minh. Ghi giả định A12 |
| 3 | Test truyền tuple `[x,y,z]` thẳng vào `createGame` (chỉ parser của CLI mới chuyển tuple sang `{pos}`) | Test đỏ + `tsc` báo lỗi kiểu | Sửa test. Typecheck nằm trong verify gate và Stop hook |
| 4 | Kỳ vọng "sinh 2 Bóng Mực trong 40 s" quên mất người chơi đứng yên sẽ bị đánh chết trước giây 35 | Test đỏ | Viết lại kỳ vọng fixture 09 bằng tính tay (chạm ở tick 1234/1354/1474, thua ở 1474) rồi mới chạy |
| 5 | Script kiểm tra hook dùng `PIPESTATUS` (bash) trong shell zsh nên mã thoát rỗng | Đọc log bằng chứng thấy `exit=` trống | Chạy lại trong `bash -c`, lưu log mới |

Những lỗi trên đều bị **test hoặc đối chiếu lập luận** chặn lại trước khi commit. Không có lỗi nào lọt vào code đã commit.

### Token / chi phí
- Extension không hiển thị số token cho agent, nên **chưa có số liệu thực**. Người dùng cần chạy `/cost` (hoặc xem trang Usage) cuối phase và điền vào đây: `Phase 1: … token / … USD`.
- Cách tiết kiệm đã dùng: đọc tài liệu một lần rồi tóm tắt vào kế hoạch; ghi file trực tiếp thay vì in code ra chat; dùng một bộ test chung cho unit và scenario; chỉ một reviewer subagent ở cuối phase thay vì review liên tục.

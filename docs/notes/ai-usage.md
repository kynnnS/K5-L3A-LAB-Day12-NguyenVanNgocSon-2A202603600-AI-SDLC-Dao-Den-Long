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
| 6 | Agent tự đặt giới hạn đảo 40 m trong core (một quyết định thiết kế, không phải yêu cầu), làm vị trí lệch khỏi contract khi đi xa | **Subagent reviewer độc lập** chạy CLI với đường đi dài | Bỏ giới hạn, thêm fixture 15. Bài học: luật không có trong contract thì không được làm đổi các con số mà contract quy định |
| 7 | Test yếu: so khớp mảng "partial" bỏ qua phần tử thừa; một test đặt tên "missing args" nhưng không thiếu tham số nào | Reviewer độc lập | So khớp đúng độ dài, test thiếu từng tham số |

Lỗi 1–5 bị **test hoặc đối chiếu lập luận** chặn lại trước khi commit. Lỗi 6–7 đã lọt vào commit và chỉ được phát hiện nhờ reviewer độc lập. Đây là lý do giữ bước review bằng một agent khác trong harness.

### Token / chi phí
- Số liệu thực đo được: subagent reviewer dùng **96 656 token** (16 lần gọi tool, khoảng 4 phút). Số này do harness báo khi subagent hoàn thành.
- Phiên agent chính: extension không hiển thị số token, nên **chưa có số liệu thực**. Người dùng cần chạy `/cost` (hoặc xem trang Usage) cuối phase và điền vào đây: `Phase 1: … token / … USD`.
- Cách tiết kiệm đã dùng: đọc tài liệu một lần rồi tóm tắt vào kế hoạch; ghi file trực tiếp thay vì in code ra chat; dùng một bộ test chung cho unit và scenario; chỉ một reviewer subagent ở cuối phase thay vì review liên tục.

## Phase 2 (Ticket-02)

### Cách làm việc
1. Lưu Ticket-02 nguyên văn vào repo. Làm Change Impact Analysis, ghi giả định B1–B12, rồi **dừng chờ duyệt**.
2. Sau khi duyệt: core + contract v1.1 → test (unit + 28 fixture tính tay) → client → tài liệu → verify → reviewer độc lập.
3. Trước khi viết test, mỗi kỳ vọng được tính bằng công thức ghi trong `description` của fixture. Kết quả: 27/28 fixture khớp ngay ở lần chạy đầu; fixture còn lại sai do lỗi dựng tình huống (xem lỗi 13).

### Lỗi thực tế của AI và cách phát hiện

| # | Lỗi | Phát hiện bằng | Cách sửa / cải tiến harness |
|---|---|---|---|
| 8 | Đặt điểm xuất phát Đêm 3 ở (0,0,0), mà điểm này nằm **trong tháp chuông** (ticket chỉ quy định xuất phát cho Đêm 1) | Chạy thử headless cả 3 Đêm: Đêm 3 không có lần chạm nào, `grounded` sai | Giả định B12: (0,0,−30), ghi chú trong `maps.ts` |
| 9 | Recoil chỉ đi 59 tick (trạng thái đặt sau bước di chuyển) | Tính tay khi chuẩn bị fixture | Bộ đếm = 60 + 1, có unit test 2 m/60 tick |
| 10 | Tiếp đất sau bục nhảy có thể trễ 1 tick vì sai số dấu phẩy động (quỹ đạo lý thuyết chạm đúng y = 0) | Tính tay quỹ đạo | Thêm sai số 1e-9 khi so độ cao |
| 11 | Bóng Mực đang bị đẩy khỏi vùng an toàn vẫn tự đuổi vào trong, nên thoát chậm hơn mức "tối đa 30 tick" | Tính tay khi viết unit test | Bóng đang bị đẩy ra thì không tự di chuyển |
| 12 | Hai test sai số học: đếm tick 120 thay vì 121 cho "120 tick sau tick 1"; test Gió Lạc bị kết thúc sớm vì Bóng Mực đánh chết Mây | Test đỏ, đọc lại lập luận | Sửa test (không đổi code). Ghi vào CLAUDE.md: tự kiểm off-by-one |
| 13 | Fixture gió dùng hàm mẫu tắt mọi thứ, **kể cả gió** | Fixture đỏ | Bật `wind_enabled`. CLAUDE.md ghi bài học "helper tắt cả gió" |
| 14 | `git rm` toàn bộ fixture làm mất luôn thư mục, khiến script sinh fixture lỗi | Lỗi `FileNotFoundError` | Tạo lại thư mục rồi chạy lại |
| 15 | Vị trí trống của đom đóm chỉ xét đom đóm tự sinh (scenario và đom đóm rơi bị bỏ qua) | Reviewer độc lập (M1) | So vị trí thay vì chỉ số điểm; unit test |
| 16 | Đẩy lùi bỏ cả bước khi gặp vật cản nên dừng sớm; unit test cũ lại khóa đúng hành vi sai đó (39.8 m) | Reviewer độc lập | Chia đôi bước; test đổi thành 40 m kèm lý do. Bài học: test viết theo code, không theo câu chữ ticket |
| 17 | Dòng `end` ghi `paused`, ngoài tập giá trị PRD cho phép | Reviewer độc lập | Ghi `playing`; unit test |
| 18 | Bóng Mực scenario `y = 0`, mặc định recoil 59 tick, hướng lướt khi bị phóng | Reviewer độc lập | Sửa + unit test cho từng lỗi |
| 19 | `git push` bị từ chối vì token thiếu quyền `workflow` (repo có `.github/workflows/ci.yml`) | Lỗi từ GitHub | Người dùng cấp quyền qua `gh auth refresh -s workflow`; không xóa `ci.yml` khỏi lịch sử |
| 20 | Lần đầu cho Bóng Mực trượt theo trục X/Z: với trụ tròn nó trượt tới đúng hoành độ của Mây rồi kẹt | Unit test đỏ + in vị trí từng 40 tick | Đổi sang rẽ hướng 15°…90°. Bài học: thử thuật toán tránh vật cản với vật cản tròn, không chỉ tường thẳng |
| 21 | Chọn lại góc 8 lần vẫn có lúc trượt hết (xác suất ≈ 0.55⁸ mỗi đom đóm) | Test 20 seed đỏ | Thêm phương án dự phòng tất định 12 hướng |

### Token / chi phí
- Reviewer Phase 1 dùng 96 656 token (số do harness báo). Reviewer Phase 2 dùng 152 934 token, 40 lần gọi công cụ, khoảng 10 phút (số do harness báo).
- Phiên chính: cần chạy `/cost` để có số thật (extension không hiển thị).
- Cách tiết kiệm: sinh fixture bằng một script (một lần ghi), bỏ qua file lớn, chỉ một reviewer chạy song song với việc viết tài liệu.

## Phase 3 (Ticket-03)

### Cách làm việc
- Người dùng cấp quyền làm trọn Phase 3. Ticket được lưu nguyên văn trước, rồi mới viết phân tích ảnh hưởng ([phase-3.md](phase-3.md) §1).
- Thứ tự P0 → P1 theo prompt: core (dầu, thứ tự tick, drain, bình minh, sức chứa, điểm, contract) → cập nhật test bị luật mới làm sai → test và fixture mới → client → ADR / CHANGELOG / harness → bằng chứng → review độc lập.
- Ngay sau khi sửa core chỉ chạy test cũ: đúng 8/94 test đỏ, và cả 8 đều ở chỗ luật bị thay (bảng §4). Đây là cách kiểm nhanh rằng thay đổi không lan sang luật cũ.
- Kỳ vọng của 33 unit test và 16 fixture mới được tính tay bằng đơn vị dầu 1/60 trước khi chạy; cả 49 PASS ngay lần đầu (không chỉnh kỳ vọng theo output).

### Lỗi thực tế của AI và cách phát hiện

| # | Lỗi | Phát hiện bằng | Cách sửa / cải tiến harness |
|---|---|---|---|
| 22 | Thêm `capacity` vào snapshot nhưng `snapshotRecord` không nhận tuning (gọi hàm `tuningOf` không tồn tại) | Đọc lại diff trước khi typecheck | Truyền `tuning` từ `run.ts` |
| 23 | Ghi đè `hud.ts` sau khi chính mình vừa sửa bằng script, nên công cụ ghi từ chối vì file đã đổi | Lỗi của công cụ Write | Đọc lại rồi ghi. Không mất dữ liệu |
| 24 | Đổi kiểu `Settings` (thêm `colorblind`) làm test cài đặt cũ không còn typecheck | `npm run typecheck` | Cập nhật test và thêm test cho cài đặt cũ thiếu khóa mới |

### Token / chi phí
- Phiên chính: cần chạy `/cost` để có số thật.
- Reviewer Phase 3: xem mục đánh giá trong [phase-3.md](phase-3.md).
- Cách tiết kiệm: sinh 16 fixture bằng một script; chỉ đọc đúng các hàm core bị ảnh hưởng; một reviewer chạy song song trong lúc viết ADR và tài liệu.

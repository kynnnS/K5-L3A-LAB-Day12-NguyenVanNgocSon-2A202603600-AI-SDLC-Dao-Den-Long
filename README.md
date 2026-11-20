# Đảo Đèn Lồng

> **Video demo:** _sẽ được thêm ở Phase 4 (Release `v1.0.0`)._
> Đề bài gốc của lab: [docs/lab/README.md](docs/lab/README.md) · Yêu cầu: [PRD-0 + Test Contract v1.0](docs/requirements/PRD-0.md)

Game 3D góc nhìn thứ ba. **Mây**, người giữ đèn nhỏ tuổi đội nón lá, gom **đom đóm** để thắp lại 5 **Đèn Lồng Lớn** của Đảo Bến và né **Bóng Mực** trong sương đen.

Nguyễn Văn Ngọc Sơn · 2A202603600 · K5-L3A Day 12 AI-SDLC

## Cài đặt và chạy (macOS / Linux, cần Node.js ≥ 20)

```bash
npm ci
npm run build
npm start          # mở http://localhost:4173 trong trình duyệt
```

## Điều khiển

| Phím | Hành động |
|---|---|
| W A S D (hoặc ↑ ↓) | Di chuyển theo hướng camera |
| Kéo chuột / ← → | Xoay camera |
| Space | Nhảy |
| E | Nạp đom đóm vào đèn gần nhất (trong 2.5 m) |
| F | Tỏa sáng: tốn 2 đom đóm, làm choáng và đẩy lùi Bóng Mực trong 6 m |
| R / Enter | Chơi lại |

## Luật chơi

- Đi qua đom đóm (≤ 1.5 m) để tự nhặt, mang tối đa 10 con.
- Mỗi đèn cần 5 đom đóm. Thắp đủ 5 đèn thì **thắng**.
- Bóng Mực đuổi theo Mây. Bị chạm thì mất 1 ngọn lửa (máu), rơi 50% số đom đóm đang mang, sau đó bất tử 2 giây.
- Hết 3 ngọn lửa thì **thua**. Hết 300 giây (bình minh) mà chưa thắp hết đèn cũng **thua**.
- Bóng Mực sợ đèn: chúng không vào được vùng bán kính 6 m quanh đèn **đã thắp**.

## Cách tính điểm

| Sự kiện | Điểm |
|---|---|
| Nhặt 1 đom đóm | +10 |
| Thắp 1 đèn | +100 |
| Mỗi Bóng Mực bị choáng bởi một lần tỏa sáng | +25 |
| Khi thắng: mỗi giây còn lại (làm tròn xuống) | +1 |
| Khi thắng: mỗi ngọn lửa còn lại | +50 |

## Chế độ headless (Test Contract v1.0)

Khai báo trong [game.contract.json](game.contract.json). Sau `npm ci && npm run build`:

```bash
node build/headless/cli.js --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--scenario scenario.json] [--inputs inputs.json] [--snapshot-every 10]
```

- Mã thoát: `0` thành công · `1` sai tham số · `2` file inputs/scenario sai định dạng. Lỗi in ra stderr, stdout để trống.
- Mọi số trong `tuning` là số game thật sự dùng: core đọc trực tiếp từ `game.contract.json`.
- `fall_enabled: false`: đảo có rìa chặn, không rơi xuống được, nên không bao giờ có sự kiện `player_hit` với `by: "fall"`.
- Không có `dash`: trường này trong inputs bị bỏ qua.

## Kiểm thử và bằng chứng

```bash
npm test                         # unit + scenario chạy qua CLI thật
bash scripts/verify.sh phase-1   # typecheck, test, build, determinism + lưu bằng chứng
```

- Bằng chứng: [docs/proof/phase-1/](docs/proof/phase-1/)
- Giả định và truy vết yêu cầu: [docs/notes/phase-1.md](docs/notes/phase-1.md)
- Nhật ký dùng AI: [docs/notes/ai-usage.md](docs/notes/ai-usage.md)

## Kiến trúc

```
src/core/      luật game thuần (fixed step 1/60 s, PRNG có seed), dùng chung cho cả hai bên
src/headless/  CLI theo Test Contract
src/client/    Three.js: render + input, gọi cùng hàm step() của core
tests/         unit (core) + scenarios (chạy CLI thật, có fixture)
```

## Sáng tạo của tôi

Phase 1 tập trung làm đúng phần lõi. Các chi tiết trình bày dưới đây chỉ nằm ở client, không đổi đầu ra headless:

- Đảo "sáng dần" theo số đèn đã thắp: cỏ ấm lên, sương tan bớt, trời bớt tối.
- Đèn nhỏ trên nón lá của Mây sáng mạnh hơn khi mang nhiều đom đóm.
- Đèn đang nạp dở hiển thị một cột sáng tiến độ.
- Đèn đã thắp có vòng sáng vàng đánh dấu vùng an toàn.

## Harness AI

[CLAUDE.md](CLAUDE.md) · skill [verify-phase](.claude/skills/verify-phase/SKILL.md) · Stop hook [stop-gate.sh](scripts/hooks/stop-gate.sh) (chặn agent kết thúc khi test đỏ) · CI [ci.yml](.github/workflows/ci.yml)

## Giấy phép

Mã nguồn: [MIT](LICENSE). Nguồn thư viện và công cụ: [CREDITS.md](CREDITS.md).

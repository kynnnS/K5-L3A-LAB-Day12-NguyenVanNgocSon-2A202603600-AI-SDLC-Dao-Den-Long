# Benchmark runs (real, not edited)

Command (= `bench_cmd` + Ticket-04 arguments): `node build/headless/bench.js --seed 42 --duration 30 --out bench.json`
Machine: Apple M5, 24 GB RAM, macOS (Darwin 25.5.0 arm64), Node v24.22.3. No Chrome/Chromium installed, so the runner opened **Safari**: vsync cannot be turned off and `peak_mem_mb` is `null` (Safari's processes are not children of the runner).

| # | Time | Result | Valid? |
|---|---|---|---|
| 1 | 2026-11-20 ≈19:30 | exit 0: `avg_fps 6`, `p1_low_fps 0.1`, `frame_ms_p95 17`, `frames 408`, `load_ms 708` | **No.** p95 = 17 ms (≈ 60 FPS for 95 % of frames) while a few frames lasted seconds: the Safari window was not visible (another Space / covered), and browsers stop drawing hidden windows. Not committed as `bench.json` |
| 2 | 2026-11-20 ≈19:33 | exit 1: "no result from the browser within 120 s" | **No.** Window hidden for the whole run (no frames at all) |

| 3 | 2026-11-20 ≈20:00 | exit 0: `avg_fps 60`, `p1_low_fps 55.6`, `frame_ms_p95 17`, `frames 1801`, `load_ms 736`, `vsync_off false` | **Yes.** Window visible; 1801 frames, longest 20 ms, none > 100 ms (raw frame times: [bench-frame-times.json](bench-frame-times.json)). This is the committed [bench.json](../../../bench.json). avg 60 = Safari's vsync cap (cannot be turned off), so the real headroom is higher |

Fix after run 2 (commit 3b5db7b and later): the page discards the measurement and restarts the 3 s warm-up whenever the window becomes hidden, so a hidden window can never produce numbers.

**Status:** valid run 3 committed. Thresholds (avg ≥ 60, p1_low ≥ 30, load ≤ 10 000) met on this machine: 60 / 55.6 / 736. The grader measures on their own machine (Ticket-04 §1); our numbers are for reference only.

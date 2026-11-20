# Credits

- **Nhân vật, bối cảnh, tên gọi** (Mây, Đảo Đèn Lồng, Bóng Mực, Đèn Lồng Lớn): bản gốc của lab Day 12 AI-SDLC.
- **Mô hình 3D**: dựng bằng code từ hình khối cơ bản của Three.js (`src/client/models.ts`), không dùng asset bên ngoài.
- **Âm thanh**: nhạc nền và hiệu ứng được tổng hợp bằng code với Web Audio API (`src/client/audio.ts`). Không dùng file âm thanh bên ngoài.
- **Thư viện**: [three.js](https://threejs.org) (MIT); [Vite](https://vite.dev) (MIT), [Vitest](https://vitest.dev) (MIT) và [TypeScript](https://www.typescriptlang.org) (Apache-2.0) chỉ dùng khi phát triển. Máy chủ game, bench và soak dùng Node.js thuần, không thêm thư viện.
- **Phông chữ, hình ảnh, video**: không dùng tệp bên ngoài (chữ dùng phông hệ thống).
- **Công cụ AI**: Claude Code (model Claude Opus 5.5) hỗ trợ phân tích yêu cầu, viết code, test và tài liệu, và chạy các agent reviewer độc lập. AI không tạo asset hình ảnh hay âm thanh nào (âm thanh và mô hình 3D đều sinh bằng code). Chi tiết trong [docs/notes/ai-usage.md](docs/notes/ai-usage.md) và [docs/notes/retro.md](docs/notes/retro.md).

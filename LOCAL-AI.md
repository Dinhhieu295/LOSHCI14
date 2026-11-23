# Demo LifeOS với Ollama trên Render

Blueprint trong `render.yaml` tạo hai service cho bản Ollama. Backend cần `DATABASE_URL` của cơ sở dữ liệu Neon dùng cho demo. Render tạo `ASSISTANT_SETTINGS_KEY`, `OLLAMA_WORKER_TOKEN` và `OLLAMA_ACCESS_CODE` dưới dạng biến môi trường.

## Chạy máy xử lý Ollama

1. Mở Ollama trên máy Windows và đảm bảo model `qwen3.5:2b-q4_K_M` đã được tải.
2. Sao chép `OLLAMA_WORKER_TOKEN` từ phần **Environment** của API trên Render. Trong PowerShell tại thư mục repo, nhập mã bằng ô nhập ẩn và khởi động tiến trình.

```powershell
$env:OLLAMA_WORKER_TOKEN = Read-Host 'Mã tiến trình Ollama' -MaskInput
node scripts/ollama-worker.mjs
```

3. Giữ Ollama và cửa sổ PowerShell chạy trong lúc demo. Tiến trình gửi yêu cầu ra ngoài qua HTTPS và gọi Ollama tại `127.0.0.1:11434`.

## Dùng bản web

Mở frontend của bản Ollama và đăng nhập. Trong **Cài đặt → Trợ lý AI → Ollama**, nhập giá trị `OLLAMA_ACCESS_CODE` của API vào ô **Mã kết nối Ollama**. Mã này dành cho tài khoản dùng thử. Mã của tiến trình chỉ dùng trên máy chạy model.

Để đổi sang **OpenAI**, chọn nhà cung cấp đó và nhập API key của tài khoản bạn. Sau khi lưu hai kết nối, chỉ cần chọn nhà cung cấp và bấm **Lưu kết nối**. Mỗi tài khoản có lựa chọn riêng và hệ thống giữ cấu hình đã lưu khi đổi qua lại.

Khi máy chạy Ollama ngoại tuyến, web vẫn truy cập được và trợ lý báo trạng thái lúc nhận yêu cầu. Dừng tiến trình bằng Ctrl+C sau buổi thử để ngừng các lượt kiểm tra hàng đợi trên Render Free.

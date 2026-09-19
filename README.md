# SkinAI — Web phân tích da bằng AI

Người dùng tải ảnh khuôn mặt + trả lời vài câu hỏi → AI ước tính **độ ẩm, sắc tố, độ dầu, lỗ chân lông, nếp nhăn**, lưu vào lịch sử và gợi ý **liều lượng, số lần/ngày, số tuần** dùng dòng sản phẩm cấp ẩm của bạn.

- **Frontend:** HTML/CSS/JS thuần (không cần build). Biểu đồ gauge/radar/xu hướng vẽ bằng SVG.
- **Backend:** PHP 8.1+ (PDO/MySQL) — chạy được trên Hostinger Shared hosting.
- **AI (giai đoạn 1):** Claude Vision (`claude-sonnet-5`). "Dạy bằng hình ảnh" = gửi kèm bộ **ảnh mẫu đã gán nhãn** (few-shot) + bảng hỏi; kết quả trả về dạng JSON có cấu trúc.
- **AI (giai đoạn 2):** `AnalyzerInterface` cho phép thay bằng model tự huấn luyện (`api/lib/CustomModelAnalyzer.php`).

> Kết quả là **ước tính từ ảnh**, không phải chẩn đoán y khoa và không thay thế thiết bị đo (corneometer…). UI đã ghi rõ điều này.

## Cấu trúc

```
index.html, app.html        Giao diện (đăng nhập / phân tích – lịch sử – báo cáo)
admin/                      Quản lý ảnh mẫu (chỉ tài khoản admin)
assets/                     CSS + JS
api/                        Endpoint PHP (auth, analyze, history, image, admin) + lib/
config/config.example.php   Mẫu cấu hình (config.php thật KHÔNG commit)
config/products.json        Danh mục sản phẩm — AI chỉ được gợi ý trong danh sách này
sql/schema.sql              Cấu trúc database
.github/workflows/deploy.yml  Tự deploy lên Hostinger khi push main
```

## Thử giao diện nhanh (không cần PHP)

Mở `app.html?demo=1` qua một web server tĩnh bất kỳ. Chế độ demo dùng dữ liệu **giả lập** trong localStorage — không có AI thật.

## Thiết lập sản phẩm của bạn

Sửa `config/products.json` (hiện là dữ liệu mẫu): `id`, `name`, `category`, `key_ingredients`, `suitable_for`, và `usage` (`dose_guide`, `max_times_per_day`, `min_weeks`, `max_weeks`, `cautions`).
Hệ thống **ép** số lần/ngày và số tuần AI đưa ra nằm trong giới hạn `usage` này, và loại bỏ mọi `product_id` không có trong danh mục.

## Triển khai

### 1. Đưa code lên GitHub
```bash
git remote add origin https://github.com/<tai-khoan>/<ten-repo>.git
git push -u origin main
```
Khuyên dùng repo **private** (sau này có thể chứa ảnh mẫu).

### 2. Chuẩn bị trên Hostinger (hPanel)
1. **SSL:** bật SSL miễn phí cho domain (file `.htaccess` sẽ ép HTTPS).
2. **PHP:** chọn PHP 8.1 trở lên; bật extension `gd`, `curl`, `mbstring`, `pdo_mysql`, `exif`.
3. **Database:** *Databases → MySQL Databases* → tạo DB + user. Vào phpMyAdmin → Import `sql/schema.sql`.
4. **FTP:** *Files → FTP Accounts* → lấy host, username, password.

### 3. Cấu hình deploy tự động
Trong repo GitHub → *Settings → Secrets and variables → Actions*, thêm:

| Secret | Giá trị |
|---|---|
| `FTP_SERVER` | host FTP của Hostinger |
| `FTP_USERNAME` | tài khoản FTP |
| `FTP_PASSWORD` | mật khẩu FTP |
| `FTP_SERVER_DIR` | ví dụ `/domains/ten-mien-cua-ban.com/public_html/` |

Mỗi lần push lên `main`, GitHub Actions sẽ kiểm tra cú pháp PHP rồi đẩy code lên server (bỏ qua `config.php`, `uploads/`, `sql/`).

### 4. Tạo `config/config.php` TRÊN SERVER
Dùng File Manager của hPanel: sao chép `config/config.example.php` thành `config/config.php`, điền thông tin DB và **`anthropic.api_key`** (lấy tại console.anthropic.com). File này không nằm trong Git và bị chặn truy cập qua web.

### 5. Tạo tài khoản admin
Đăng ký một tài khoản trên web, rồi trong phpMyAdmin chạy:
```sql
UPDATE users SET role = 'admin' WHERE email = 'ban@example.com';
```
Sau đó vào `/admin/` để tải ảnh mẫu đã gán nhãn (độ ẩm/sắc tố/độ dầu). Nên có 6–12 ảnh đa dạng.

## "Dạy" AI bằng hình ảnh — vận hành thế nào
- Mỗi lần phân tích, hệ thống chọn tối đa `limits.max_reference_images` ảnh mẫu (lấy đều theo thang độ ẩm) và gửi kèm để Claude hiệu chuẩn thang điểm.
- Chất lượng phụ thuộc vào **độ chính xác của nhãn** bạn gán: nên có chuyên gia/thiết bị đo đối chiếu.
- Prompt caching được bật cho phần ảnh mẫu + danh mục sản phẩm để giảm chi phí các lần gọi sau.
- **Giai đoạn 2:** khi có đủ dữ liệu có nhãn (hàng trăm–nghìn ảnh, kèm sự đồng ý của người dùng), huấn luyện model riêng và cài vào `CustomModelAnalyzer`, rồi đặt `'analyzer' => 'custom'` trong config.

## Chi phí & giới hạn
- Mỗi lượt phân tích = 1 lần gọi Claude API (có ảnh) → có phí. Mặc định giới hạn `analyses_per_day = 5` lượt/người/24h (sửa trong `config.php`). Lỗi do hệ thống/AI sẽ không bị tính lượt.

## Quyền riêng tư & bảo mật
- Ảnh mặt là dữ liệu nhạy cảm (Nghị định 13/2023/NĐ-CP): có checkbox đồng ý khi đăng ký, ghi rõ ảnh được gửi tới nhà cung cấp AI; người dùng tự xoá từng kết quả, toàn bộ lịch sử hoặc cả tài khoản.
- Ảnh được mã hoá lại thành JPEG ở server (loại EXIF/GPS), lưu tên ngẫu nhiên trong `uploads/` (bị chặn truy cập trực tiếp) và chỉ phục vụ qua `api/image.php` sau khi kiểm tra quyền. Khuyên đặt `storage_path` **ngoài** `public_html`.
- Mật khẩu băm bằng `password_hash`; CSRF token cho mọi POST; cookie phiên `HttpOnly/SameSite`; giới hạn đăng nhập sai; PDO prepared statements.
- API key chỉ nằm trong `config/config.php` trên server.
- Nhớ cập nhật trang Chính sách quyền riêng tư/Điều khoản theo quy định trước khi mở cho công chúng.

## Kiểm thử thủ công sau khi deploy
1. Đăng ký → đăng nhập → tải ảnh → nhận kết quả → thấy trong *Lịch sử* → xoá được.
2. Ảnh không có mặt / ảnh mờ → báo lỗi thân thiện, không lưu.
3. `https://<domain>/config/config.php`, `https://<domain>/uploads/…`, `https://<domain>/sql/schema.sql` phải bị **chặn** (403/404).

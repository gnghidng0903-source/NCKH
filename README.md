# MikiSkin — Web phân tích da bằng AI

Người dùng tải ảnh khuôn mặt + trả lời vài câu hỏi → AI ước tính **độ ẩm, sắc tố, độ dầu, lỗ chân lông, nếp nhăn**, lưu vào lịch sử và gợi ý **liều lượng, số lần/ngày, số tuần** dùng dòng sản phẩm cấp ẩm của bạn.

- **Frontend:** HTML/CSS/JS thuần (không cần build). Biểu đồ gauge/radar/xu hướng vẽ bằng SVG.
- **Backend:** PHP 8.1+ (PDO/MySQL) — chạy được trên Hostinger Shared hosting.
- **AI (giai đoạn 1):** Claude Vision (`claude-sonnet-5`). "Dạy bằng hình ảnh" = gửi kèm bộ **ảnh mẫu đã gán nhãn** (few-shot) + bảng hỏi; kết quả trả về dạng JSON có cấu trúc.
- **AI (giai đoạn 2):** `AnalyzerInterface` cho phép thay bằng model tự huấn luyện (`api/lib/CustomModelAnalyzer.php`).

> Kết quả là **ước tính từ ảnh**, không phải chẩn đoán y khoa và không thay thế thiết bị đo (corneometer…). UI đã ghi rõ điều này.

## Cấu trúc

```
index.html, app.html        Giao diện (đăng nhập / phân tích – lịch sử – báo cáo)
admin/                      Quản lý ảnh mẫu + chấm độ chính xác AI (chỉ tài khoản admin)
assets/                     CSS + JS
api/                        Endpoint PHP (auth, analyze, history, image, admin) + lib/
config/config.example.php   Mẫu cấu hình (config.php thật KHÔNG commit)
config/products.json        Danh mục sản phẩm — AI chỉ được gợi ý trong danh sách này
sql/schema.sql              Cấu trúc database
manifest.json, sw.js, offline.html, assets/js/pwa.js   PWA — cài app từ trình duyệt (xem mục bên dưới)
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

## PWA — cài thành app từ trình duyệt (QR code)

Web này đã là một **Progressive Web App**: người dùng quét mã QR trỏ tới trang, mở bằng Safari (iPhone) hoặc Chrome (Android), cài lên màn hình chính và dùng như app thật (toàn màn hình, có icon riêng, không có thanh địa chỉ). Không cần App Store / Google Play, không cần build riêng cho iOS/Android.

**Bắt buộc phải chạy trên HTTPS** (Hostinger cấp SSL miễn phí — xem mục Triển khai). PWA sẽ không cài được qua HTTP thường hay qua IP nội bộ (trừ `localhost` khi phát triển).

### Cách hoạt động
- `manifest.json` khai báo tên, icon, `display: standalone`, màu theme — quyết định app trông ra sao khi cài.
- `sw.js` (Service Worker) chạy nền trong trình duyệt, cho phép cài đặt và mở nhanh hơn ở lần sau.
- `assets/js/pwa.js` (đã nạp sẵn trong `index.html` và `app.html`) tự đăng ký Service Worker, hiện nút **"Cài đặt ứng dụng"** khi trình duyệt cho phép (Android/Chrome desktop), và hiện hướng dẫn thao tác tay khi mở bằng Safari iOS (vì iOS không cho web tự bật hộp thoại cài đặt).
- `assets/icons/` chứa icon app (192/512, bản "maskable" bo theo hình tròn/vuông của từng máy, và icon riêng cho iOS).

### Tự động cập nhật khi bạn deploy bản mới
Service Worker cố tình **không lưu cứng** HTML/CSS/JS: trang luôn ưu tiên tải bản mới nhất từ mạng khi máy có Internet (network-first cho trang, stale-while-revalidate cho CSS/JS/ảnh), chỉ dùng bản đã lưu khi mất mạng. Nghĩa là:
- Bạn deploy bản mới lên Hostinger như bình thường (`git push`) — **không cần làm gì thêm**.
- Người dùng đã cài app sẽ thấy nội dung mới ngay trong lần mở tiếp theo có mạng, không cần gỡ cài đặt lại.
- Nếu bạn có sửa chính `sw.js` (đổi cách cache, hiếm khi cần), người đang mở app sẽ thấy một thanh nhỏ "Đã có bản cập nhật mới — Tải lại" ở cuối màn hình.

### Tạo mã QR để chia sẻ
QR code chỉ đơn giản là ảnh mã hoá đường dẫn website (ví dụ `https://ten-mien-cua-ban.com/`). Sau khi đã deploy và có domain thật:
1. Dùng một công cụ tạo QR miễn phí (ví dụ me-qr.com, qr-code-generator.com) hoặc mục tạo QR có sẵn trong hPanel của Hostinger.
2. Dán đúng URL trang chủ (`index.html`) — **không** dán link tới `app.html` hay các trang admin.
3. Tải QR về, in/chèn vào tài liệu, poster, danh thiếp…

### Kiểm thử sau khi deploy
Việc đăng ký Service Worker cần một máy chủ HTTP chuẩn (Apache/Hostinger) — **không kiểm tra được bằng máy chủ tĩnh tạm trên máy** khi phát triển, nên phần này cần bạn tự xác nhận trên bản đã deploy thật:

1. Mở trang bằng Chrome desktop → F12 → tab **Application** → **Manifest**: phải thấy đúng tên, icon, không có lỗi đỏ. Tab **Service Workers**: trạng thái phải là "activated and is running".
2. Chrome desktop → menu ⋮ → nếu thấy mục "Cài đặt MikiSkin…" (hoặc icon cài đặt ⊕ trên thanh địa chỉ) nghĩa là đủ điều kiện cài đặt.
3. Chạy Lighthouse (tab **Lighthouse** trong DevTools) → mục "Installable" nên đạt PASS toàn bộ tiêu chí PWA.
4. Test ngoại tuyến: tab **Network** → chọn "Offline" → tải lại trang đã từng mở trước đó → vẫn hiện được (bản đã lưu hoặc trang `offline.html`).

**Vì sao đôi khi thấy nội dung/tên cũ dù đã deploy đúng?** Hostinger có một lớp CDN riêng (hCDN) cache `.css`/`.js` **7 ngày theo đúng URL** và **không tự xoá cache khi bạn FTP file mới lên** — nghĩa là CDN có thể tiếp tục phát bản cũ cho **mọi người xem** (không chỉ ai đã ghé trước đó) cho tới khi cache tự hết hạn. `.htaccess` đã ép `Cache-Control: no-cache` cho mọi `.css`/`.js` để CDN và trình duyệt luôn phải hỏi lại server gốc trước khi dùng bản đã lưu (file chưa đổi → server trả `304` rất nhẹ; đã đổi → luôn lấy đúng bản mới). Nếu sau này bạn đổi `.htaccess` này, cần đợi vài phút để deploy + CDN cập nhật rồi mới kiểm tra; cách xác nhận nhanh nhất là mở DevTools → Network → xem header `Cache-Control`/`X-Hcdn-Cache-Status` của file `.js` bất kỳ.

## Hướng dẫn cài đặt cho người dùng cuối

### iPhone / iPad (Safari — **bắt buộc dùng Safari**, Chrome trên iOS không cài được PWA)
1. Quét mã QR bằng Camera → mở link trong **Safari**.
2. Bấm nút **Chia sẻ** (hình vuông có mũi tên đi lên) ở thanh dưới cùng màn hình.
3. Kéo xuống, chọn **"Thêm vào MH chính"** (Add to Home Screen).
4. Bấm **"Thêm"** ở góc trên bên phải.
5. Icon MikiSkin xuất hiện trên màn hình chính — mở lên sẽ chạy toàn màn hình như app thật, không còn thanh địa chỉ.

*(App cũng tự hiện nút "Cài đặt ứng dụng" ngay trong trang, bấm vào sẽ hiện lại đúng 4 bước trên.)*

### Android (Chrome)
1. Quét mã QR → mở link trong **Chrome**.
2. Cách 1 — nhanh nhất: nếu thấy banner "Thêm MikiSkin vào Màn hình chính" hiện phía dưới, hoặc icon **⊕/Cài đặt** ở thanh địa chỉ, bấm vào rồi chọn **"Cài đặt"**.
3. Cách 2 — thủ công: bấm menu **⋮** (góc trên phải) → chọn **"Cài đặt ứng dụng"** (hoặc "Thêm vào Màn hình chính") → xác nhận **"Cài đặt"**.
4. Icon MikiSkin xuất hiện trong danh sách app như một app cài từ Play Store, mở toàn màn hình.

*(Trong trang cũng có sẵn nút "Cài đặt ứng dụng" ở góc trên — Chrome sẽ tự hiện hộp thoại cài đặt khi bấm.)*

### Vì sao đôi khi chưa thấy nút/hộp thoại cài đặt ngay
Chrome chỉ cho cài khi trang đáp ứng đủ điều kiện kỹ thuật (HTTPS hợp lệ, Service Worker hoạt động, manifest hợp lệ — như checklist kiểm thử ở trên) **và** đôi khi cần người dùng đã ghé trang một lần trước đó/tương tác một chút (tiêu chí "engagement" riêng của từng trình duyệt, có thể thay đổi theo phiên bản). Nếu chưa thấy, chỉ cần dùng cách thủ công (mục "Chia sẻ" trên iOS, menu ⋮ trên Android) — luôn hoạt động bất kể tiêu chí đó.

## Chấm độ chính xác của AI (`/admin/benchmark.html`)

Cho AI phân tích một **bộ ảnh kiểm tra có nhãn thật** rồi so kết quả với nhãn, để biết AI lệch bao nhiêu điểm.

1. Vào `/admin/benchmark.html` (tài khoản admin), thêm **≥ 20 ảnh kiểm tra** cùng nhãn thật (độ ẩm/sắc tố/độ dầu, tốt nhất đo bằng thiết bị). Ảnh kiểm tra lưu ở bảng riêng nên **không bao giờ** bị gửi kèm làm ảnh mẫu — nhưng hãy dùng người khác với ảnh mẫu.
2. Bấm **Chạy đánh giá**. Trình duyệt gọi máy chủ chấm từng ảnh một (mỗi ảnh = 1 lượt gọi Claude API, có phí); lỗi tạm thời được tự thử lại một lần.
3. Đọc kết quả: sai số trung bình (MAE), lệch hệ thống (AI chấm cao/thấp hơn thực tế), tỷ lệ trong ±5/±10 điểm, hệ số tương quan, biểu đồ nhãn thật – AI chấm và bảng từng ảnh.
4. Đổi ảnh mẫu hoặc prompt rồi chạy lại: mỗi lần chạy được lưu và so sánh với lần trước ("tốt hơn/kém hơn X điểm"). Bỏ chọn *Dùng ảnh mẫu* để có lần chạy đối chứng, cho biết ảnh mẫu có thật sự giúp ích không.

Khi bạn chuyển sang model tự huấn luyện (`'analyzer' => 'custom'`), cùng bộ ảnh kiểm tra này dùng để so model mới với Claude.

> Nếu đã import `sql/schema.sql` từ trước, hãy import lại file này (dùng `CREATE TABLE IF NOT EXISTS`, an toàn) để có thêm 3 bảng `eval_*`.

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

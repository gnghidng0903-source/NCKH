<?php
// Sao chép file này thành config/config.php TRÊN SERVER và điền thông tin thật.
// config.php đã nằm trong .gitignore — không bao giờ commit key/mật khẩu lên GitHub.

return [
    'db' => [
        'host'    => 'localhost',
        'name'    => 'u123456789_skin',
        'user'    => 'u123456789_skin',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],

    // 'claude' = giai đoạn 1 (Claude Vision + ảnh mẫu). 'custom' = model tự huấn luyện (giai đoạn 2).
    'analyzer' => 'claude',

    'anthropic' => [
        'api_key' => '',                 // lấy tại console.anthropic.com
        'model'   => 'claude-sonnet-5',
        'timeout' => 90,                 // giây
    ],

    'custom_model' => [
        'endpoint' => '',                // dùng cho giai đoạn 2
        'token'    => '',
    ],

    // Nơi lưu ảnh người dùng. Nên đặt NGOÀI public_html nếu có thể, ví dụ '/home/u123/skin_storage'.
    'storage_path' => dirname(__DIR__) . '/uploads',

    'limits' => [
        'analyses_per_day'     => 5,     // số lượt phân tích / người dùng / 24h
        'max_reference_images' => 6,     // số ảnh mẫu gửi kèm mỗi lần gọi AI
        'max_upload_mb'        => 8,
    ],

    'debug' => false,
];

<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

// GET ?id=N        → ảnh của một lần phân tích (chỉ chủ sở hữu hoặc admin)
// GET ?ref=N       → ảnh mẫu (chỉ admin)
// GET ?bench=N     → ảnh kiểm tra độ chính xác (chỉ admin)

require_method('GET');
$user = require_user();
$pdo = Db::pdo();

if (isset($_GET['ref']) || isset($_GET['bench'])) {
    if ($user['role'] !== 'admin') {
        json_error('Bạn không có quyền truy cập.', 403);
    }
    $table = isset($_GET['bench']) ? 'eval_images' : 'reference_images';
    $stmt = $pdo->prepare("SELECT path FROM {$table} WHERE id = ?");
    $stmt->execute([(int) ($_GET['bench'] ?? $_GET['ref'])]);
} else {
    $stmt = $pdo->prepare('SELECT image_path AS path FROM analyses WHERE id = ? AND (user_id = ? OR ? = 1)');
    $stmt->execute([(int) ($_GET['id'] ?? 0), $user['id'], $user['role'] === 'admin' ? 1 : 0]);
}
$row = $stmt->fetch();
$path = $row ? Storage::fullPath($row['path']) : null;
if ($path === null) {
    json_error('Không tìm thấy ảnh.', 404);
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . filesize($path));
header('Cache-Control: private, max-age=3600');
header('X-Content-Type-Options: nosniff');
readfile($path);

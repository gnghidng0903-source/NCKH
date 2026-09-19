<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

// GET               → danh sách (mới nhất trước) để vẽ lịch sử/xu hướng
// GET ?id=N         → chi tiết một lần phân tích
// POST ?action=delete&id=N
// POST ?action=delete_all

$user = require_user();
$pdo = Db::pdo();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare('SELECT * FROM analyses WHERE id = ? AND user_id = ?');
        $stmt->execute([(int) $_GET['id'], $user['id']]);
        $row = $stmt->fetch();
        if (!$row) {
            json_error('Không tìm thấy kết quả.', 404);
        }
        json_out(['analysis' => present_analysis($row)]);
    }
    $stmt = $pdo->prepare('SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200');
    $stmt->execute([$user['id']]);
    json_out(['items' => array_map(static fn($r) => present_analysis($r, false), $stmt->fetchAll())]);
}

require_method('POST');
require_csrf();

switch ($_GET['action'] ?? '') {
    case 'delete':
        $stmt = $pdo->prepare('SELECT image_path FROM analyses WHERE id = ? AND user_id = ?');
        $stmt->execute([(int) ($_GET['id'] ?? 0), $user['id']]);
        $row = $stmt->fetch();
        if (!$row) {
            json_error('Không tìm thấy kết quả.', 404);
        }
        Storage::delete($row['image_path']);
        $pdo->prepare('DELETE FROM analyses WHERE id = ? AND user_id = ?')->execute([(int) $_GET['id'], $user['id']]);
        json_out(['ok' => true]);

    case 'delete_all':
        $stmt = $pdo->prepare('SELECT image_path FROM analyses WHERE user_id = ?');
        $stmt->execute([$user['id']]);
        foreach ($stmt->fetchAll() as $row) {
            Storage::delete($row['image_path']);
        }
        $pdo->prepare('DELETE FROM analyses WHERE user_id = ?')->execute([$user['id']]);
        json_out(['ok' => true]);

    default:
        json_error('Hành động không hợp lệ.', 404);
}

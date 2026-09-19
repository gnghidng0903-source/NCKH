<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

// Quản lý ảnh mẫu (few-shot). Chỉ admin.
// GET                → danh sách ảnh mẫu
// POST ?action=add   → multipart: image, hydration_pct, pigmentation_pct, oil_pct, notes
// POST ?action=delete&id=N

require_admin();
$pdo = Db::pdo();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $rows = $pdo->query('SELECT id, hydration_pct, pigmentation_pct, oil_pct, notes, created_at FROM reference_images ORDER BY id DESC')->fetchAll();
    foreach ($rows as &$r) {
        $r['image_url'] = 'api/image.php?ref=' . (int) $r['id'];
        $r['created_at'] = iso_utc($r['created_at']);
    }
    json_out(['items' => $rows]);
}

require_method('POST');
require_csrf();

switch ($_GET['action'] ?? '') {
    case 'add':
        $file = $_FILES['image'] ?? null;
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            json_error('Vui lòng chọn ảnh mẫu.');
        }
        $vals = [];
        foreach (['hydration_pct', 'pigmentation_pct', 'oil_pct'] as $k) {
            $v = $_POST[$k] ?? '';
            if (!is_numeric($v) || $v < 0 || $v > 100) {
                json_error("Giá trị {$k} phải từ 0 đến 100.");
            }
            $vals[$k] = (int) round((float) $v);
        }
        try {
            $jpeg = Images::normalizeUpload($file['tmp_name'], 768); // ảnh mẫu thu nhỏ để tiết kiệm token
        } catch (RuntimeException $e) {
            json_error($e->getMessage(), 422);
        }
        $path = Storage::saveJpeg('ref', $jpeg);
        $notes = mb_substr(trim(strip_tags((string) ($_POST['notes'] ?? ''))), 0, 500);
        $pdo->prepare('INSERT INTO reference_images (path, hydration_pct, pigmentation_pct, oil_pct, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$path, $vals['hydration_pct'], $vals['pigmentation_pct'], $vals['oil_pct'], $notes, now_utc()]);
        json_out(['ok' => true, 'id' => (int) $pdo->lastInsertId()], 201);

    case 'delete':
        $stmt = $pdo->prepare('SELECT path FROM reference_images WHERE id = ?');
        $stmt->execute([(int) ($_GET['id'] ?? 0)]);
        $row = $stmt->fetch();
        if (!$row) {
            json_error('Không tìm thấy ảnh mẫu.', 404);
        }
        Storage::delete($row['path']);
        $pdo->prepare('DELETE FROM reference_images WHERE id = ?')->execute([(int) $_GET['id']]);
        json_out(['ok' => true]);

    default:
        json_error('Hành động không hợp lệ.', 404);
}

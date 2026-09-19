<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

// Chấm độ chính xác (benchmark) của AI trên bộ ảnh kiểm tra có nhãn. Chỉ admin.
//
// GET                              → {images, runs[{..., results[]}]}  (20 lần chạy gần nhất)
// POST ?action=add                 → multipart: image, hydration_pct, pigmentation_pct, oil_pct, notes
// POST ?action=delete&id=N         → xoá ảnh kiểm tra
// POST ?action=start               → {use_references, note} → tạo lần chạy, trả danh sách ảnh cần chấm
// POST ?action=score&run_id=&image_id=  → chấm MỘT ảnh (client gọi lần lượt để không vượt thời gian chạy của PHP)
// POST ?action=finish&run_id=N     → đóng lần chạy
// POST ?action=delete_run&id=N

const MAX_EVAL_IMAGES = 100;

require_admin();
$pdo = Db::pdo();

function eval_present_result(array $r): array
{
    $n = static fn($v) => $v === null ? null : (int) $v;
    return [
        'image_id'          => $n($r['image_id']),
        'true_hydration'    => (int) $r['true_hydration'],
        'true_pigmentation' => (int) $r['true_pigmentation'],
        'true_oil'          => (int) $r['true_oil'],
        'pred_hydration'    => $n($r['pred_hydration']),
        'pred_pigmentation' => $n($r['pred_pigmentation']),
        'pred_oil'          => $n($r['pred_oil']),
        'error'             => $r['error_msg'],
    ];
}

function eval_run_or_fail(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare('SELECT * FROM eval_runs WHERE id = ?');
    $stmt->execute([$id]);
    $run = $stmt->fetch();
    if (!$run) {
        json_error('Không tìm thấy lần chạy.', 404);
    }
    return $run;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $images = $pdo->query('SELECT id, hydration_pct, pigmentation_pct, oil_pct, notes, created_at FROM eval_images ORDER BY id DESC')->fetchAll();
    foreach ($images as &$img) {
        $img['image_url'] = 'api/image.php?bench=' . (int) $img['id'];
        $img['created_at'] = iso_utc($img['created_at']);
    }
    unset($img);

    $runs = $pdo->query('SELECT * FROM eval_runs ORDER BY id DESC LIMIT 20')->fetchAll();
    $byRun = [];
    if ($runs) {
        $ids = array_map(static fn($r) => (int) $r['id'], $runs);
        $in = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT * FROM eval_results WHERE run_id IN ($in) ORDER BY id");
        $stmt->execute($ids);
        foreach ($stmt->fetchAll() as $r) {
            $byRun[(int) $r['run_id']][] = eval_present_result($r);
        }
    }
    $out = [];
    foreach ($runs as $r) {
        $out[] = [
            'id'              => (int) $r['id'],
            'model_version'   => $r['model_version'],
            'use_references'  => (bool) $r['use_references'],
            'reference_count' => (int) $r['reference_count'],
            'note'            => $r['note'],
            'started_at'      => iso_utc($r['started_at']),
            'finished_at'     => $r['finished_at'] ? iso_utc($r['finished_at']) : null,
            'results'         => $byRun[(int) $r['id']] ?? [],
        ];
    }
    json_out(['images' => $images, 'runs' => $out, 'max_images' => MAX_EVAL_IMAGES]);
}

require_method('POST');
require_csrf();

switch ($_GET['action'] ?? '') {
    case 'add':
        $count = (int) $pdo->query('SELECT COUNT(*) FROM eval_images')->fetchColumn();
        if ($count >= MAX_EVAL_IMAGES) {
            json_error('Đã đạt tối đa ' . MAX_EVAL_IMAGES . ' ảnh kiểm tra.');
        }
        $file = $_FILES['image'] ?? null;
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            json_error('Vui lòng chọn ảnh kiểm tra.');
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
            $jpeg = Images::normalizeUpload($file['tmp_name']); // giữ độ phân giải như ảnh người dùng thật (1568px)
        } catch (RuntimeException $e) {
            json_error($e->getMessage(), 422);
        }
        $path = Storage::saveJpeg('eval', $jpeg);
        $notes = mb_substr(trim(strip_tags((string) ($_POST['notes'] ?? ''))), 0, 500);
        $pdo->prepare('INSERT INTO eval_images (path, hydration_pct, pigmentation_pct, oil_pct, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$path, $vals['hydration_pct'], $vals['pigmentation_pct'], $vals['oil_pct'], $notes, now_utc()]);
        json_out(['ok' => true, 'id' => (int) $pdo->lastInsertId()], 201);

    case 'delete':
        $stmt = $pdo->prepare('SELECT path FROM eval_images WHERE id = ?');
        $stmt->execute([(int) ($_GET['id'] ?? 0)]);
        $row = $stmt->fetch();
        if (!$row) {
            json_error('Không tìm thấy ảnh kiểm tra.', 404);
        }
        Storage::delete($row['path']);
        $pdo->prepare('DELETE FROM eval_images WHERE id = ?')->execute([(int) $_GET['id']]);
        json_out(['ok' => true]);

    case 'start':
        $in = input_json();
        $useRefs = !empty($in['use_references']);
        $ids = array_map('intval', $pdo->query('SELECT id FROM eval_images ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));
        if (!$ids) {
            json_error('Chưa có ảnh kiểm tra. Hãy thêm ảnh có nhãn trước.');
        }
        $refCount = $useRefs ? count(References::load((int) cfg('limits.max_reference_images', 6))) : 0;
        $analyzer = AnalyzerFactory::make();
        $note = mb_substr(trim(strip_tags((string) ($in['note'] ?? ''))), 0, 200);
        $pdo->prepare('INSERT INTO eval_runs (model_version, use_references, reference_count, note, started_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$analyzer->version(), $useRefs ? 1 : 0, $refCount, $note, now_utc()]);
        json_out([
            'run_id'          => (int) $pdo->lastInsertId(),
            'model_version'   => $analyzer->version(),
            'reference_count' => $refCount,
            'image_ids'       => $ids,
        ], 201);

    case 'score':
        set_time_limit(150);
        $run = eval_run_or_fail($pdo, (int) ($_GET['run_id'] ?? 0));
        if ($run['finished_at'] !== null) {
            json_error('Lần chạy này đã kết thúc.', 409);
        }
        $imageId = (int) ($_GET['image_id'] ?? 0);
        $stmt = $pdo->prepare('SELECT * FROM eval_images WHERE id = ?');
        $stmt->execute([$imageId]);
        $img = $stmt->fetch();
        if (!$img) {
            json_error('Không tìm thấy ảnh kiểm tra.', 404);
        }

        // Đã chấm rồi thì trả kết quả cũ, không gọi AI lần nữa (tránh tốn phí khi client gọi lặp).
        $stmt = $pdo->prepare('SELECT * FROM eval_results WHERE run_id = ? AND image_id = ?');
        $stmt->execute([(int) $run['id'], $imageId]);
        if ($existing = $stmt->fetch()) {
            json_out(['result' => eval_present_result($existing)]);
        }

        $bytes = Storage::read($img['path']);
        if ($bytes === null) {
            json_error('Không đọc được file ảnh kiểm tra.', 500);
        }
        $catalog = load_catalog();
        if (!$catalog) {
            json_error('Chưa có danh mục sản phẩm (config/products.json).', 500);
        }
        $references = $run['use_references'] ? References::load((int) cfg('limits.max_reference_images', 6)) : [];
        $analyzer = AnalyzerFactory::make();

        try {
            // Bảng hỏi rỗng: chấm thuần theo ảnh, không để thông tin khác ảnh hưởng.
            $raw = $analyzer->analyze($bytes, Validator::questionnaire([]), $catalog, $references);
        } catch (AnalyzerException $e) {
            // Lỗi hệ thống/AI: KHÔNG lưu, để client có thể chạy lại đúng ảnh này.
            json_error($e->getMessage(), $e->httpStatus());
        }

        $norm = Validator::normalize($raw, $catalog);
        $rejection = Validator::rejection($norm);
        $m = $norm['metrics'];
        $pred = $rejection === null ? [$m['hydration_pct'], $m['pigmentation_pct'], $m['oil_pct']] : [null, null, null];

        $pdo->prepare(
            'INSERT INTO eval_results (run_id, image_id, true_hydration, true_pigmentation, true_oil, pred_hydration, pred_pigmentation, pred_oil, error_msg, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            (int) $run['id'], $imageId,
            (int) $img['hydration_pct'], (int) $img['pigmentation_pct'], (int) $img['oil_pct'],
            $pred[0], $pred[1], $pred[2],
            $rejection !== null ? mb_substr($rejection, 0, 255) : null,
            now_utc(),
        ]);
        $stmt = $pdo->prepare('SELECT * FROM eval_results WHERE run_id = ? AND image_id = ?');
        $stmt->execute([(int) $run['id'], $imageId]);
        json_out(['result' => eval_present_result($stmt->fetch())], 201);

    case 'finish':
        $run = eval_run_or_fail($pdo, (int) ($_GET['run_id'] ?? 0));
        $pdo->prepare('UPDATE eval_runs SET finished_at = ? WHERE id = ? AND finished_at IS NULL')->execute([now_utc(), (int) $run['id']]);
        json_out(['ok' => true]);

    case 'delete_run':
        eval_run_or_fail($pdo, (int) ($_GET['id'] ?? 0));
        $pdo->prepare('DELETE FROM eval_runs WHERE id = ?')->execute([(int) $_GET['id']]);
        json_out(['ok' => true]);

    default:
        json_error('Hành động không hợp lệ.', 404);
}

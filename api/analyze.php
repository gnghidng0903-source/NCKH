<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

// POST multipart: image (file) + questionnaire (JSON string) → phân tích, lưu và trả kết quả.

require_method('POST');
$user = require_user();
require_csrf();
set_time_limit(150);

$file = $_FILES['image'] ?? null;
if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    $tooBig = in_array($file['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
    json_error($tooBig ? 'Ảnh quá lớn.' : 'Vui lòng chọn một ảnh khuôn mặt.', $tooBig ? 413 : 400);
}
$maxBytes = (int) cfg('limits.max_upload_mb', 8) * 1024 * 1024;
if ($file['size'] > $maxBytes) {
    json_error('Ảnh quá lớn (tối đa ' . cfg('limits.max_upload_mb', 8) . ' MB).', 413);
}

$questionnaire = json_decode((string) ($_POST['questionnaire'] ?? '{}'), true);
$answers = Validator::questionnaire(is_array($questionnaire) ? $questionnaire : []);

try {
    $jpeg = Images::normalizeUpload($file['tmp_name']);
} catch (RuntimeException $e) {
    json_error($e->getMessage(), 422);
}

$catalog = load_catalog();
if (!$catalog) {
    json_error('Chưa có danh mục sản phẩm (config/products.json).', 500);
}

$pdo = Db::pdo();
$references = References::load((int) cfg('limits.max_reference_images', 6));

$remaining = RateLimit::consumeAnalysis((int) $user['id'], (int) cfg('limits.analyses_per_day', 5));

$analyzer = AnalyzerFactory::make();

try {
    $raw = $analyzer->analyze($jpeg, $answers, $catalog, $references);
} catch (AnalyzerException $e) {
    RateLimit::refundAnalysis((int) $user['id']); // lỗi phía hệ thống → không tính lượt
    json_error($e->getMessage(), $e->httpStatus());
}

$result = Validator::normalize($raw, $catalog);
$rejection = Validator::rejection($result);
if ($rejection !== null) {
    json_out(['error' => $rejection, 'code' => 'bad_image', 'remaining_today' => $remaining], 422);
}

$imagePath = Storage::saveJpeg('u' . $user['id'], $jpeg);
$m = $result['metrics'];
$pdo->prepare(
    'INSERT INTO analyses (user_id, image_path, questionnaire, result, hydration_pct, pigmentation_pct, oil_pct, overall_score, model_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
)->execute([
    $user['id'],
    $imagePath,
    json_encode($answers, JSON_UNESCAPED_UNICODE),
    json_encode($result, JSON_UNESCAPED_UNICODE),
    $m['hydration_pct'],
    $m['pigmentation_pct'],
    $m['oil_pct'],
    $m['overall_score'],
    $analyzer->version(),
    now_utc(),
]);

$stmt = $pdo->prepare('SELECT * FROM analyses WHERE id = ?');
$stmt->execute([(int) $pdo->lastInsertId()]);
json_out(['analysis' => present_analysis($stmt->fetch()), 'remaining_today' => $remaining], 201);

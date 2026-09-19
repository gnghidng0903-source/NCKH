<?php
declare(strict_types=1);

// Khởi tạo chung cho mọi endpoint: cấu hình, autoload, session, helper JSON/CSRF/auth.

ini_set('display_errors', '0');
error_reporting(E_ALL);
date_default_timezone_set('UTC');

spl_autoload_register(static function (string $class): void {
    $file = __DIR__ . '/lib/' . $class . '.php';
    if (is_file($file)) {
        require $file;
    }
});

set_exception_handler(static function (Throwable $e): void {
    error_log('[skin-ai] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $msg = cfg('debug', false) ? $e->getMessage() : 'Lỗi máy chủ. Vui lòng thử lại sau.';
    json_out(['error' => $msg], 500);
});

function cfg(string $path, mixed $default = null): mixed
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/../config/config.php';
        $config = is_file($file) ? (require $file) : [];
    }
    $cur = $config;
    foreach (explode('.', $path) as $key) {
        if (!is_array($cur) || !array_key_exists($key, $cur)) {
            return $default;
        }
        $cur = $cur[$key];
    }
    return $cur;
}

function json_out(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function json_error(string $message, int $status = 400): never
{
    json_out(['error' => $message], $status);
}

function require_method(string ...$methods): void
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        json_error('Phương thức không được hỗ trợ.', 405);
    }
}

function input_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error('Dữ liệu gửi lên không hợp lệ.');
    }
    return $data;
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('skinai_sid');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function csrf_token(): string
{
    start_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function require_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || $sent === '' || !hash_equals(csrf_token(), $sent)) {
        json_error('Phiên làm việc hết hạn. Vui lòng tải lại trang.', 403);
    }
}

function current_user(): ?array
{
    start_session();
    $id = $_SESSION['user_id'] ?? null;
    if (!$id) {
        return null;
    }
    $stmt = Db::pdo()->prepare('SELECT id, email, name, role FROM users WHERE id = ?');
    $stmt->execute([(int) $id]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        json_error('Bạn cần đăng nhập.', 401);
    }
    return $user;
}

function require_admin(): array
{
    $user = require_user();
    if ($user['role'] !== 'admin') {
        json_error('Bạn không có quyền truy cập.', 403);
    }
    return $user;
}

function now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}

function iso_utc(string $mysqlDate): string
{
    return str_replace(' ', 'T', $mysqlDate) . 'Z';
}

/** Chuyển một dòng bảng analyses thành JSON trả cho client. */
function present_analysis(array $row, bool $full = true): array
{
    $out = [
        'id'               => (int) $row['id'],
        'created_at'       => iso_utc($row['created_at']),
        'hydration_pct'    => (int) $row['hydration_pct'],
        'pigmentation_pct' => (int) $row['pigmentation_pct'],
        'oil_pct'          => (int) $row['oil_pct'],
        'overall_score'    => (int) $row['overall_score'],
        'image_url'        => 'api/image.php?id=' . (int) $row['id'],
    ];
    if ($full) {
        $out['model_version'] = $row['model_version'];
        $out['questionnaire'] = json_decode($row['questionnaire'], true) ?: [];
        $out['result'] = json_decode($row['result'], true) ?: [];
    }
    return $out;
}

function load_catalog(): array
{
    $file = __DIR__ . '/../config/products.json';
    $data = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
    $products = is_array($data) ? ($data['products'] ?? []) : [];
    $byId = [];
    foreach ($products as $p) {
        if (isset($p['id'])) {
            $byId[$p['id']] = $p;
        }
    }
    return $byId;
}

<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

// GET  ?action=me        → {user|null, csrf}
// POST ?action=register  → {name,email,password,consent}
// POST ?action=login     → {email,password}
// POST ?action=logout
// POST ?action=delete_account → xoá tài khoản + toàn bộ ảnh/kết quả

$action = $_GET['action'] ?? '';

if ($action === 'me') {
    require_method('GET');
    json_out(['user' => current_user(), 'csrf' => csrf_token()]);
}

require_method('POST');
require_csrf();
$in = input_json();
$pdo = Db::pdo();
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

switch ($action) {
    case 'register':
        $name = trim((string) ($in['name'] ?? ''));
        $email = strtolower(trim((string) ($in['email'] ?? '')));
        $password = (string) ($in['password'] ?? '');
        if ($name === '' || mb_strlen($name) > 100) {
            json_error('Vui lòng nhập họ tên (tối đa 100 ký tự).');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
            json_error('Email không hợp lệ.');
        }
        if (strlen($password) < 8 || strlen($password) > 200) {
            json_error('Mật khẩu cần từ 8 ký tự.');
        }
        if (empty($in['consent'])) {
            json_error('Bạn cần đồng ý cho phép xử lý ảnh và dữ liệu da để sử dụng dịch vụ.');
        }
        $exists = $pdo->prepare('SELECT 1 FROM users WHERE email = ?');
        $exists->execute([$email]);
        if ($exists->fetch()) {
            json_error('Email này đã được đăng ký.', 409);
        }
        $now = now_utc();
        $pdo->prepare('INSERT INTO users (email, password_hash, name, role, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name, 'user', $now, $now]);
        $userId = (int) $pdo->lastInsertId();
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        json_out(['user' => current_user(), 'csrf' => csrf_token()], 201);

    case 'login':
        if (RateLimit::loginBlocked($ip)) {
            json_error('Bạn đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.', 429);
        }
        $email = strtolower(trim((string) ($in['email'] ?? '')));
        $password = (string) ($in['password'] ?? '');
        $stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        if (!$row || !password_verify($password, $row['password_hash'])) {
            RateLimit::loginFailed($ip);
            json_error('Email hoặc mật khẩu không đúng.', 401);
        }
        RateLimit::loginSucceeded($ip);
        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $row['id'];
        json_out(['user' => current_user(), 'csrf' => csrf_token()]);

    case 'logout':
        start_session();
        $_SESSION = [];
        session_destroy();
        json_out(['ok' => true]);

    case 'delete_account':
        $user = require_user();
        $stmt = $pdo->prepare('SELECT image_path FROM analyses WHERE user_id = ?');
        $stmt->execute([$user['id']]);
        foreach ($stmt->fetchAll() as $row) {
            Storage::delete($row['image_path']);
        }
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$user['id']]); // analyses xoá theo ON DELETE CASCADE
        $_SESSION = [];
        session_destroy();
        json_out(['ok' => true]);

    default:
        json_error('Hành động không hợp lệ.', 404);
}

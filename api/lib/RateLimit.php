<?php
declare(strict_types=1);

final class RateLimit
{
    /**
     * Ném lỗi 429 nếu người dùng đã dùng hết lượt phân tích trong 24 giờ qua; nếu còn thì ghi nhận 1 lượt.
     * @return int số lượt còn lại sau lượt này
     */
    public static function consumeAnalysis(int $userId, int $maxPerDay): int
    {
        $pdo = Db::pdo();
        $since = gmdate('Y-m-d H:i:s', time() - 86400);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM api_usage WHERE user_id = ? AND created_at >= ?');
        $stmt->execute([$userId, $since]);
        $used = (int) $stmt->fetchColumn();
        if ($used >= $maxPerDay) {
            json_error("Bạn đã dùng hết {$maxPerDay} lượt phân tích trong 24 giờ. Vui lòng quay lại sau.", 429);
        }
        $pdo->prepare('INSERT INTO api_usage (user_id, created_at) VALUES (?, ?)')->execute([$userId, now_utc()]);
        // Dọn bản ghi cũ để bảng không phình to.
        $pdo->prepare('DELETE FROM api_usage WHERE created_at < ?')->execute([gmdate('Y-m-d H:i:s', time() - 7 * 86400)]);
        return $maxPerDay - $used - 1;
    }

    /** Hoàn lại lượt khi lỗi do phía hệ thống/AI (không phải lỗi của người dùng). */
    public static function refundAnalysis(int $userId): void
    {
        Db::pdo()->prepare('DELETE FROM api_usage WHERE user_id = ? ORDER BY id DESC LIMIT 1')->execute([$userId]);
    }

    public static function loginBlocked(string $ip): bool
    {
        $stmt = Db::pdo()->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND created_at >= ?');
        $stmt->execute([$ip, gmdate('Y-m-d H:i:s', time() - 900)]);
        return (int) $stmt->fetchColumn() >= 10;
    }

    public static function loginFailed(string $ip): void
    {
        Db::pdo()->prepare('INSERT INTO login_attempts (ip, created_at) VALUES (?, ?)')->execute([$ip, now_utc()]);
    }

    public static function loginSucceeded(string $ip): void
    {
        Db::pdo()->prepare('DELETE FROM login_attempts WHERE ip = ?')->execute([$ip]);
    }
}

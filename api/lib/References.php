<?php
declare(strict_types=1);

/** Chọn ảnh mẫu (few-shot) gửi kèm mỗi lần gọi AI. Dùng chung cho phân tích thật và chấm độ chính xác. */
final class References
{
    /**
     * Lấy mẫu đều theo thang độ ẩm và xác định (giữ nguyên giữa các lần gọi để tận dụng prompt caching).
     * Ảnh kiểm tra (eval_images) nằm ở bảng riêng nên KHÔNG bao giờ lọt vào đây.
     */
    public static function load(int $max): array
    {
        if ($max <= 0) {
            return [];
        }
        $rows = Db::pdo()->query('SELECT * FROM reference_images ORDER BY hydration_pct, id')->fetchAll();
        if (count($rows) > $max) {
            $picked = [];
            for ($i = 0; $i < $max; $i++) {
                $picked[] = $rows[(int) round($i * (count($rows) - 1) / max(1, $max - 1))];
            }
            $rows = $picked;
        }

        $refs = [];
        foreach ($rows as $r) {
            $bytes = Storage::read($r['path']);
            if ($bytes !== null) {
                $refs[] = [
                    'jpeg'             => $bytes,
                    'hydration_pct'    => (int) $r['hydration_pct'],
                    'pigmentation_pct' => (int) $r['pigmentation_pct'],
                    'oil_pct'          => (int) $r['oil_pct'],
                    'notes'            => (string) $r['notes'],
                ];
            }
        }
        return $refs;
    }
}

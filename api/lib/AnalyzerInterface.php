<?php
declare(strict_types=1);

/**
 * Bộ phân tích da. Giai đoạn 1: ClaudeAnalyzer. Giai đoạn 2: CustomModelAnalyzer (model tự huấn luyện).
 * Cả hai trả về cùng một cấu trúc "thô" (xem ClaudeAnalyzer::toolSchema) để Validator chuẩn hoá.
 */
interface AnalyzerInterface
{
    /** Định danh phiên bản model, lưu cùng mỗi kết quả. */
    public function version(): string;

    /**
     * @param string $jpeg       ảnh mặt (JPEG) đã chuẩn hoá
     * @param array  $answers    bảng hỏi đã làm sạch
     * @param array  $catalog    danh sách sản phẩm [id => product]
     * @param array  $references ảnh mẫu: [['jpeg' => bytes, 'hydration_pct' => int, 'pigmentation_pct' => int, 'oil_pct' => int, 'notes' => string], ...]
     * @throws AnalyzerException
     */
    public function analyze(string $jpeg, array $answers, array $catalog, array $references): array;
}

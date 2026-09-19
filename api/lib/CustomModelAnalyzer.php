<?php
declare(strict_types=1);

/**
 * Giai đoạn 2 (chưa triển khai): gọi model CNN tự huấn luyện, host riêng.
 * Endpoint cần nhận ảnh JPEG + bảng hỏi và trả JSON đúng cấu trúc của ClaudeAnalyzer::toolSchema().
 * Bật bằng config: 'analyzer' => 'custom'.
 */
final class CustomModelAnalyzer implements AnalyzerInterface
{
    public function __construct(private string $endpoint, private string $token)
    {
    }

    public function version(): string
    {
        return 'custom:v0';
    }

    public function analyze(string $jpeg, array $answers, array $catalog, array $references): array
    {
        throw new AnalyzerException('Model tự huấn luyện chưa được triển khai.', 501);
    }
}

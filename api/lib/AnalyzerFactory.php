<?php
declare(strict_types=1);

/** Tạo bộ phân tích theo config (giai đoạn 1 = claude, giai đoạn 2 = custom). */
final class AnalyzerFactory
{
    public static function make(): AnalyzerInterface
    {
        return match (cfg('analyzer', 'claude')) {
            'custom' => new CustomModelAnalyzer(
                (string) cfg('custom_model.endpoint', ''),
                (string) cfg('custom_model.token', '')
            ),
            default => new ClaudeAnalyzer(
                (string) cfg('anthropic.api_key', ''),
                (string) cfg('anthropic.model', 'claude-sonnet-5'),
                (int) cfg('anthropic.timeout', 90)
            ),
        };
    }
}

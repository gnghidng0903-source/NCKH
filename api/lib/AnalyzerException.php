<?php
declare(strict_types=1);

/** Lỗi từ bộ phân tích AI. getMessage() là câu an toàn để hiển thị cho người dùng. */
final class AnalyzerException extends RuntimeException
{
    public function __construct(string $userMessage, private int $httpStatus = 502, ?Throwable $previous = null)
    {
        parent::__construct($userMessage, 0, $previous);
    }

    public function httpStatus(): int
    {
        return $this->httpStatus;
    }
}

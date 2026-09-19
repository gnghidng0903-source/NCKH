<?php
declare(strict_types=1);

/** Xử lý ảnh tải lên: kiểm tra loại thật, xoay theo EXIF, thu nhỏ, mã hoá lại JPEG (xoá metadata/EXIF/GPS). */
final class Images
{
    private const MAX_PIXELS = 40_000_000;

    /** @throws RuntimeException với thông báo an toàn để hiển thị */
    public static function normalizeUpload(string $tmpPath, int $maxSide = 1568): string
    {
        if (!extension_loaded('gd')) {
            throw new RuntimeException('Máy chủ chưa bật thư viện xử lý ảnh (GD).');
        }
        $info = @getimagesize($tmpPath);
        if ($info === false) {
            throw new RuntimeException('Tệp tải lên không phải ảnh hợp lệ.');
        }
        [$w, $h, $type] = $info;
        if (!in_array($type, [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            throw new RuntimeException('Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.');
        }
        if ($w < 200 || $h < 200) {
            throw new RuntimeException('Ảnh quá nhỏ (tối thiểu 200×200 px).');
        }
        if ($w * $h > self::MAX_PIXELS) {
            throw new RuntimeException('Ảnh có độ phân giải quá lớn.');
        }

        $src = match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($tmpPath),
            IMAGETYPE_PNG  => @imagecreatefrompng($tmpPath),
            IMAGETYPE_WEBP => @imagecreatefromwebp($tmpPath),
        };
        if (!$src) {
            throw new RuntimeException('Không đọc được ảnh. Hãy thử ảnh khác.');
        }

        if ($type === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $exif = @exif_read_data($tmpPath);
            $rot = match ((int) ($exif['Orientation'] ?? 1)) {
                3 => 180,
                6 => -90,
                8 => 90,
                default => 0,
            };
            if ($rot !== 0) {
                $rotated = imagerotate($src, $rot, 0);
                if ($rotated) {
                    $src = $rotated;
                }
            }
        }

        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1.0, $maxSide / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));

        $dst = imagecreatetruecolor($nw, $nh);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255)); // nền trắng cho PNG/WebP trong suốt
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);

        ob_start();
        imagejpeg($dst, null, 88);
        $jpeg = (string) ob_get_clean();
        return $jpeg;
    }
}

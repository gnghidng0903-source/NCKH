<?php
declare(strict_types=1);

/** Lưu/đọc/xoá ảnh trong thư mục storage (không truy cập công khai; phục vụ qua api/image.php). */
final class Storage
{
    public static function root(): string
    {
        $root = (string) cfg('storage_path', __DIR__ . '/../../uploads');
        if (!is_dir($root)) {
            @mkdir($root, 0750, true);
        }
        $guard = $root . '/.htaccess';
        if (!is_file($guard)) {
            @file_put_contents($guard, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
        }
        return $root;
    }

    /** Lưu JPEG vào thư mục con, trả về đường dẫn tương đối để ghi vào DB. */
    public static function saveJpeg(string $subdir, string $jpeg): string
    {
        $subdir = preg_replace('/[^a-z0-9_\-]/i', '', $subdir) ?? '';
        $dir = self::root() . '/' . $subdir;
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new RuntimeException('Không tạo được thư mục lưu ảnh.');
        }
        $name = bin2hex(random_bytes(16)) . '.jpg';
        if (file_put_contents($dir . '/' . $name, $jpeg) === false) {
            throw new RuntimeException('Không ghi được ảnh vào máy chủ.');
        }
        return $subdir . '/' . $name;
    }

    public static function fullPath(string $relative): ?string
    {
        if (!preg_match('#^[a-z0-9_\-]+/[a-f0-9]{32}\.jpg$#i', $relative)) {
            return null; // chặn path traversal
        }
        $path = self::root() . '/' . $relative;
        return is_file($path) ? $path : null;
    }

    public static function read(string $relative): ?string
    {
        $path = self::fullPath($relative);
        if ($path === null) {
            return null;
        }
        $bytes = file_get_contents($path);
        return $bytes === false ? null : $bytes;
    }

    public static function delete(string $relative): void
    {
        $path = self::fullPath($relative);
        if ($path !== null) {
            @unlink($path);
        }
    }
}

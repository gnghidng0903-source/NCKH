-- Schema cho web phân tích da. Import vào MySQL/MariaDB (phpMyAdmin trên hPanel).
-- Thời gian được lưu theo UTC.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  consent_at    DATETIME NOT NULL,
  created_at    DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analyses (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL,
  image_path       VARCHAR(255) NOT NULL,
  questionnaire    LONGTEXT NOT NULL,
  result           LONGTEXT NOT NULL,
  hydration_pct    TINYINT UNSIGNED NOT NULL,
  pigmentation_pct TINYINT UNSIGNED NOT NULL,
  oil_pct          TINYINT UNSIGNED NOT NULL,
  overall_score    TINYINT UNSIGNED NOT NULL,
  model_version    VARCHAR(80) NOT NULL,
  created_at       DATETIME NOT NULL,
  KEY idx_analyses_user_created (user_id, created_at),
  CONSTRAINT fk_analyses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ảnh mẫu có nhãn để "dạy" AI (few-shot). Quản lý ở /admin/.
CREATE TABLE IF NOT EXISTS reference_images (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  path             VARCHAR(255) NOT NULL,
  hydration_pct    TINYINT UNSIGNED NOT NULL,
  pigmentation_pct TINYINT UNSIGNED NOT NULL,
  oil_pct          TINYINT UNSIGNED NOT NULL,
  notes            VARCHAR(500) NOT NULL DEFAULT '',
  created_at       DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Đếm lượt gọi AI để giới hạn chi phí theo ngày.
CREATE TABLE IF NOT EXISTS api_usage (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_usage_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Giới hạn đăng nhập sai theo IP.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip         VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_attempts_ip_created (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nâng một tài khoản lên admin (chạy sau khi đã đăng ký tài khoản đó):
-- UPDATE users SET role = 'admin' WHERE email = 'ban@example.com';

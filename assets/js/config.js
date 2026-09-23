// Cấu hình phía giao diện. Đổi tên thương hiệu ở đây.
window.SKIN_CONFIG = {
  brand: "MikiSkin",
  apiBase: "api",
  // Chế độ demo (?demo=1): chạy hoàn toàn trên trình duyệt, không cần máy chủ/PHP, dữ liệu giả lập.
  demo: new URLSearchParams(location.search).has("demo"),
};

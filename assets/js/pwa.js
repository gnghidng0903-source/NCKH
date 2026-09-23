// Đăng ký Service Worker + trải nghiệm cài app (PWA).
// Nạp file này trên MỌI trang muốn được Service Worker kiểm soát (đã đủ nếu chỉ index.html
// và app.html nạp nó — SW có scope toàn site nên các trang khác, kể cả /admin/, vẫn được
// SW phục vụ ở những lần tải sau mà không cần tự đăng ký lại).
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;

  var isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!isSecure) return; // Service Worker chỉ chạy trên HTTPS (hoặc localhost khi phát triển)

  var swUrl = new URL("sw.js", document.baseURI).pathname; // luôn trỏ đúng gốc site dù trang đang ở /admin/
  var reloading = false;

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register(swUrl)
      .then(function (reg) {
        reg.update().catch(function () {});
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") reg.update().catch(function () {});
        });
        setInterval(function () {
          reg.update().catch(function () {});
        }, 60 * 60 * 1000);
      })
      .catch(function (err) {
        console.warn("Không đăng ký được Service Worker:", err);
      });

    // Có bản Service Worker mới đã kích hoạt (do bạn deploy sw.js mới) → mời tải lại để chắc chắn có bản mới nhất.
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloading) return;
      showUpdateBanner();
    });
  });

  // ---------------- Banner "có bản cập nhật" ----------------
  function showUpdateBanner() {
    if (document.getElementById("pwa-update-banner")) return;
    var bar = document.createElement("div");
    bar.id = "pwa-update-banner";
    bar.className = "pwa-update-banner";
    bar.setAttribute("role", "status");
    bar.innerHTML =
      '<span>Đã có bản cập nhật mới của SkinAI.</span>' +
      '<button type="button" class="btn btn-sm">Tải lại</button>';
    bar.querySelector("button").addEventListener("click", function () {
      reloading = true;
      location.reload();
    });
    document.body.appendChild(bar);
  }

  // ---------------- Cài đặt ứng dụng ----------------
  var deferredPrompt = null;
  var isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  function installButtons() {
    var list = Array.prototype.slice.call(document.querySelectorAll("[data-pwa-install]"));
    if (!list.length) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "btn btn-sm pwa-fab";
      el.setAttribute("data-pwa-install", "");
      el.hidden = true;
      document.body.appendChild(el);
      list.push(el);
    }
    return list;
  }

  function setInstallLabel(btn) {
    btn.innerHTML = '<span aria-hidden="true">⬇️</span> Cài đặt ứng dụng';
  }

  function showInstallButtons() {
    if (isStandalone) return;
    installButtons().forEach(function (btn) {
      setInstallLabel(btn);
      btn.hidden = false;
      btn.onclick = onInstallClick;
    });
  }

  function hideInstallButtons() {
    installButtons().forEach(function (btn) {
      btn.hidden = true;
    });
  }

  function onInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        hideInstallButtons();
      });
    } else if (isIOS) {
      showIOSInstructions();
    }
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButtons();
  });

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    hideInstallButtons();
  });

  // iOS Safari không hỗ trợ beforeinstallprompt — luôn cho phép mở hướng dẫn thủ công.
  // (Kiểm tra readyState vì script này thường nạp cuối trang, sau khi DOMContentLoaded đã bắn.)
  if (isIOS && !isStandalone) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showInstallButtons);
    } else {
      showInstallButtons();
    }
  }

  function showIOSInstructions() {
    if (document.getElementById("pwa-ios-modal")) return;
    var wrap = document.createElement("div");
    wrap.id = "pwa-ios-modal";
    wrap.className = "pwa-modal-backdrop";
    wrap.innerHTML =
      '<div class="pwa-modal card" role="dialog" aria-modal="true" aria-labelledby="pwa-ios-title">' +
      '<h2 id="pwa-ios-title" class="card-title">Cài đặt SkinAI lên màn hình chính</h2>' +
      '<ol class="steps">' +
      '<li><span><b>Bấm nút Chia sẻ</b>Biểu tượng hình vuông có mũi tên đi lên, nằm ở thanh dưới cùng của Safari.</span></li>' +
      '<li><span><b>Chọn "Thêm vào MH chính"</b>Add to Home Screen — kéo xuống nếu chưa thấy ngay.</span></li>' +
      '<li><span><b>Bấm "Thêm"</b>Biểu tượng SkinAI sẽ xuất hiện trên màn hình chính như một app.</span></li>' +
      "</ol>" +
      '<button type="button" class="btn btn-primary btn-block">Đã hiểu</button>' +
      "</div>";
    wrap.querySelector("button").addEventListener("click", closeIOSModal);
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) closeIOSModal();
    });
    document.addEventListener("keydown", escCloseOnce);
    document.body.appendChild(wrap);
  }

  function escCloseOnce(e) {
    if (e.key === "Escape") closeIOSModal();
  }

  function closeIOSModal() {
    var el = document.getElementById("pwa-ios-modal");
    if (el) el.remove();
    document.removeEventListener("keydown", escCloseOnce);
  }

  // ---------------- CSS tối thiểu (dùng chung biến màu với assets/css/style.css) ----------------
  var style = document.createElement("style");
  style.textContent =
    ".pwa-update-banner{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:200;" +
    "display:flex;align-items:center;gap:12px;padding:10px 14px 10px 18px;border-radius:999px;" +
    "background:var(--ink,#2b2231);color:#fff;font-size:.86rem;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.25);" +
    "max-width:92vw}" +
    ".pwa-update-banner .btn{background:#fff;color:var(--ink,#2b2231);box-shadow:none}" +
    ".pwa-fab{position:fixed;right:16px;bottom:16px;z-index:150;box-shadow:0 8px 22px rgba(226,80,143,.35)}" +
    ".pwa-modal-backdrop{position:fixed;inset:0;background:rgba(43,34,49,.45);z-index:300;" +
    "display:flex;align-items:flex-end;justify-content:center;padding:16px}" +
    "@media (min-width:640px){.pwa-modal-backdrop{align-items:center}}" +
    ".pwa-modal{max-width:420px;width:100%;padding:26px}" +
    ".pwa-modal .steps{margin:16px 0 20px}";
  document.head.appendChild(style);
})();

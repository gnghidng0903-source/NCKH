// Tiện ích dùng chung.
(function () {
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  const Util = {
    esc(v) {
      return String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
    },

    fmtDate(iso, withTime = true) {
      const d = new Date(iso);
      if (isNaN(d)) return "";
      const opts = { day: "2-digit", month: "2-digit", year: "numeric" };
      if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
      return d.toLocaleString("vi-VN", opts);
    },

    fmtPrice(n, currency = "VND") {
      if (n == null || n === "") return "";
      if (currency === "VND") return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
      return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(n);
    },

    SKIN_TYPES: { dry: "Da khô", normal: "Da thường", oily: "Da dầu", combination: "Da hỗn hợp", sensitive: "Da nhạy cảm" },
    TIMING: { morning: "Buổi sáng", evening: "Buổi tối", both: "Sáng & tối" },

    // Mức đánh giá cho thang "cao = tốt".
    rating(score) {
      if (score >= 85) return { text: "Xuất sắc", cls: "lvl-excellent" };
      if (score >= 70) return { text: "Tốt", cls: "lvl-good" };
      if (score >= 50) return { text: "Trung bình", cls: "lvl-mid" };
      return { text: "Cần cải thiện", cls: "lvl-low" };
    },

    headline(score) {
      if (score >= 80) return "Da khoẻ mạnh!";
      if (score >= 60) return "Da khá ổn";
      return "Da cần được chăm sóc";
    },

    // 5 trục cho radar — tất cả theo chiều "cao = tốt".
    radarAxes(m) {
      return [
        { key: "hydration", label: "Độ ẩm", value: m.hydration_pct },
        { key: "pores", label: "Lỗ chân lông", value: m.pores_score },
        { key: "wrinkles", label: "Nếp nhăn", value: m.wrinkles_score },
        { key: "spots", label: "Đều màu", value: 100 - m.pigmentation_pct },
        { key: "sebum", label: "Kiểm soát dầu", value: 100 - m.oil_pct },
      ];
    },

    toast(message, kind = "") {
      let host = document.querySelector(".toasts");
      if (!host) {
        host = document.createElement("div");
        host.className = "toasts";
        host.setAttribute("role", "status");
        host.setAttribute("aria-live", "polite");
        document.body.appendChild(host);
      }
      const el = document.createElement("div");
      el.className = "toast " + kind;
      el.textContent = message;
      host.appendChild(el);
      setTimeout(() => el.remove(), 4500);
    },

    // Rút gọn văn bản tóm tắt để chia sẻ.
    summaryText(a) {
      const r = a.result;
      const m = r.metrics;
      const lines = [
        `Kết quả phân tích da (${Util.fmtDate(a.created_at)})`,
        `Điểm tổng: ${m.overall_score}/100 · Độ ẩm: ${m.hydration_pct}% · Sắc tố: ${m.pigmentation_pct}% · Độ dầu: ${m.oil_pct}%`,
      ];
      (r.recommendations || []).forEach((x) => {
        lines.push(`• ${x.name}: ${x.dose}, ${x.times_per_day} lần/ngày (${Util.TIMING[x.timing] || ""}), ${x.duration_weeks} tuần`);
      });
      lines.push("(Ước tính bởi AI, không thay thế chẩn đoán y khoa)");
      return lines.join("\n");
    },
  };

  window.Util = Util;
})();

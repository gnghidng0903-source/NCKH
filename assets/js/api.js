// Gọi API PHP. Ở chế độ demo (?demo=1) dùng dữ liệu giả lập lưu trong localStorage — KHÔNG có AI thật.
(function () {
  const { apiBase, demo } = window.SKIN_CONFIG;
  let csrf = "";

  class ApiError extends Error {
    constructor(message, status, data) {
      super(message);
      this.status = status;
      this.data = data;
    }
  }

  async function req(path, { method = "GET", json, form } = {}) {
    const headers = {};
    if (method !== "GET") headers["X-CSRF-Token"] = csrf;
    let body;
    if (json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }
    let res;
    try {
      res = await fetch(`${apiBase}/${path}`, { method, headers, body, credentials: "same-origin" });
    } catch (_) {
      throw new ApiError("Không kết nối được máy chủ. Kiểm tra mạng và thử lại.", 0);
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* không phải JSON */ }
    if (!res.ok) throw new ApiError((data && data.error) || `Lỗi máy chủ (${res.status}).`, res.status, data);
    return data;
  }

  // ---------------- Demo ----------------
  const Demo = {
    KEY: "skinai_demo_v1",
    load() {
      try { return JSON.parse(localStorage.getItem(this.KEY)) || { nextId: 1, items: [] }; }
      catch (_) { return { nextId: 1, items: [] }; }
    },
    save(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (_) { /* đầy bộ nhớ */ } },
    products: [
      { product_id: "serum-ha-cap-am", name: "Serum cấp ẩm Hyaluronic Acid", category: "Tinh chất", price: 359000, currency: "VND", how: "Thoa lên da còn hơi ẩm sau bước làm sạch, vỗ nhẹ cho thấm.", dose: "2–3 giọt (khoảng 0,1–0,15 ml)", times_per_day: 2, timing: "both", duration_weeks: 8, notes: "Dữ liệu demo." },
      { product_id: "kem-duong-khoa-am", name: "Kem dưỡng khoá ẩm Ceramide", category: "Kem dưỡng", price: 429000, currency: "VND", how: "Thoa lớp mỏng đều lên mặt và cổ sau serum.", dose: "Lượng bằng hạt ngô (0,5–1 g)", times_per_day: 2, timing: "both", duration_weeks: 8, notes: "Dữ liệu demo." },
      { product_id: "mat-na-ngu-cap-am", name: "Mặt nạ ngủ cấp ẩm", category: "Chăm sóc chuyên sâu", price: 299000, currency: "VND", how: "Thoa một lớp dày vừa phải như bước cuối buổi tối, sáng rửa sạch.", dose: "Lượng bằng đồng xu lớn (1–1,5 g)", times_per_day: 1, timing: "evening", duration_weeks: 4, notes: "2–3 lần mỗi tuần. Dữ liệu demo." },
    ],
    fake(seed, q) {
      const r = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.round((seed / 233280) * n); };
      const hydration = 45 + r(45), pig = 8 + r(40), oil = 15 + r(55);
      const pores = 55 + r(40), wrinkles = 60 + r(38);
      const overall = Math.round(hydration * 0.35 + (100 - pig) * 0.2 + (100 - oil) * 0.15 + pores * 0.15 + wrinkles * 0.15);
      return {
        is_face: true, image_quality: "good", quality_issues: [],
        metrics: { hydration_pct: hydration, pigmentation_pct: pig, oil_pct: oil, pores_score: pores, wrinkles_score: wrinkles, overall_score: overall },
        skin_type: q.skin_type_self && q.skin_type_self !== "unknown" ? q.skin_type_self : "combination",
        confidence: 60 + r(30),
        summary: "KẾT QUẢ DEMO — số liệu giả lập, không phải phân tích thật. Khi triển khai, phần này do AI phân tích từ ảnh và bảng hỏi của bạn.",
        observations: [`Độ ẩm ước tính ${hydration}%`, `Sắc tố không đều ở mức ${pig}%`, "Vùng chữ T hơi bóng dầu (demo)"],
        needs_dermatologist: false,
        precautions: ["Thử sản phẩm trên vùng da nhỏ 24 giờ trước khi dùng lần đầu.", "Kết quả chỉ là ước tính, không thay thế tư vấn y khoa."],
        recheck_after_days: 28,
        recommendations: this.products.slice(0, hydration < 60 ? 3 : 2),
      };
    },
  };

  const DemoUser = { id: 1, email: "demo@example.com", name: "Bạn (demo)", role: "user" };

  function demoRow(item) {
    return { id: item.id, created_at: item.created_at, image_url: item.image_url, hydration_pct: item.result.metrics.hydration_pct, pigmentation_pct: item.result.metrics.pigmentation_pct, oil_pct: item.result.metrics.oil_pct, overall_score: item.result.metrics.overall_score };
  }

  // ---------------- Giao diện API ----------------
  const Api = {
    ApiError,
    demo,

    async me() {
      if (demo) return { user: DemoUser, csrf: "demo" };
      const data = await req("auth.php?action=me");
      csrf = data.csrf;
      return data;
    },
    async register(payload) {
      const data = await req("auth.php?action=register", { method: "POST", json: payload });
      csrf = data.csrf;
      return data;
    },
    async login(payload) {
      const data = await req("auth.php?action=login", { method: "POST", json: payload });
      csrf = data.csrf;
      return data;
    },
    async logout() {
      if (demo) return { ok: true };
      return req("auth.php?action=logout", { method: "POST", json: {} });
    },
    async deleteAccount() {
      if (demo) { localStorage.removeItem(Demo.KEY); return { ok: true }; }
      return req("auth.php?action=delete_account", { method: "POST", json: {} });
    },

    // file: Blob JPEG đã nén; questionnaire: object
    async analyze(file, questionnaire, thumbFile) {
      if (demo) {
        await new Promise((r) => setTimeout(r, 2600));
        const s = Demo.load();
        const item = {
          id: s.nextId++,
          created_at: new Date().toISOString(),
          image_url: thumbFile ? await ImageTools.thumbnail(thumbFile) : "",
          model_version: "demo",
          questionnaire,
          result: Demo.fake(file.size, questionnaire),
        };
        s.items.unshift(item);
        Demo.save(s);
        return { analysis: { ...demoRow(item), model_version: "demo", questionnaire, result: item.result }, remaining_today: 99 };
      }
      const form = new FormData();
      form.append("image", file, "face.jpg");
      form.append("questionnaire", JSON.stringify(questionnaire));
      return req("analyze.php", { method: "POST", form });
    },

    async history() {
      if (demo) return { items: Demo.load().items.map(demoRow) };
      return req("history.php");
    },
    async detail(id) {
      if (demo) {
        const item = Demo.load().items.find((i) => i.id === id);
        if (!item) throw new ApiError("Không tìm thấy kết quả.", 404);
        return { analysis: { ...demoRow(item), model_version: "demo", questionnaire: item.questionnaire, result: item.result } };
      }
      return req(`history.php?id=${encodeURIComponent(id)}`);
    },
    async remove(id) {
      if (demo) { const s = Demo.load(); s.items = s.items.filter((i) => i.id !== id); Demo.save(s); return { ok: true }; }
      return req(`history.php?action=delete&id=${encodeURIComponent(id)}`, { method: "POST", json: {} });
    },
    async removeAll() {
      if (demo) { const s = Demo.load(); s.items = []; Demo.save(s); return { ok: true }; }
      return req("history.php?action=delete_all", { method: "POST", json: {} });
    },

    // Quản trị ảnh mẫu
    adminList() { return req("admin.php"); },
    adminAdd(form) { return req("admin.php?action=add", { method: "POST", form }); },
    adminDelete(id) { return req(`admin.php?action=delete&id=${encodeURIComponent(id)}`, { method: "POST", json: {} }); },
  };

  window.Api = Api;
})();

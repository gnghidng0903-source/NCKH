// Ứng dụng chính: Phân tích / Lịch sử / Báo cáo.
(function () {
  const { esc, fmtDate, fmtPrice, SKIN_TYPES, TIMING, rating, headline, radarAxes, toast } = Util;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const state = {
    user: null,
    view: "analyze",
    blob: null,        // ảnh đã nén để gửi đi
    rawFile: null,     // ảnh gốc (chỉ dùng cho demo thumbnail)
    previewUrl: "",
    current: null,     // kết quả đang hiển thị ở tab Phân tích
    reportItem: null,  // kết quả đang hiển thị ở tab Báo cáo
    history: [],
    busy: false,
  };

  const VIEWS = ["analyze", "history", "report"];

  // ============================================================
  // Điều hướng
  // ============================================================
  function setView(view) {
    state.view = view;
    VIEWS.forEach((v) => {
      $(`#view-${v}`).hidden = v !== view;
      const tab = $(`#tab-${v}`);
      tab.setAttribute("aria-selected", v === view);
      tab.tabIndex = v === view ? 0 : -1;
    });
    if (view === "history") loadHistory();
    if (view === "report") renderReportView();
    window.scrollTo({ top: 0 });
  }

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = VIEWS.indexOf(state.view) + (e.key === "ArrowRight" ? 1 : -1);
      const next = VIEWS[(i + VIEWS.length) % VIEWS.length];
      setView(next);
      $(`#tab-${next}`).focus();
    });
  });

  // ============================================================
  // Ảnh: chọn / kéo thả / xem trước
  // ============================================================
  const stage = $("#photo-stage");
  const preview = $("#photo-preview");

  function setPhoto(src) {
    if (src) {
      preview.src = src;
      preview.hidden = false;
      $("#photo-empty").hidden = true;
      stage.classList.add("filled");
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
      $("#photo-empty").hidden = false;
      stage.classList.remove("filled");
    }
    $("#btn-clear-photo").hidden = !src || !!state.current;
  }

  async function handleFile(file) {
    if (!file) return;
    showAnalyzeError("");
    try {
      const blob = await ImageTools.compress(file);
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.blob = blob;
      state.rawFile = file;
      state.previewUrl = URL.createObjectURL(blob);
      resetToInput(false);
      setPhoto(state.previewUrl);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  $("#file-input").addEventListener("change", (e) => { handleFile(e.target.files[0]); e.target.value = ""; });
  $("#file-camera").addEventListener("change", (e) => { handleFile(e.target.files[0]); e.target.value = ""; });
  $("#btn-clear-photo").addEventListener("click", () => {
    state.blob = null; state.rawFile = null;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = "";
    setPhoto("");
  });
  ["dragenter", "dragover"].forEach((ev) => stage.addEventListener(ev, (e) => { e.preventDefault(); stage.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => stage.addEventListener(ev, (e) => { e.preventDefault(); stage.classList.remove("drag"); }));
  stage.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

  // ============================================================
  // Bảng hỏi + gửi phân tích
  // ============================================================
  function num(v) { return v === "" || v == null ? null : Number(v); }

  function collectQuestionnaire() {
    const fd = new FormData($("#q-form"));
    return {
      skin_type_self: fd.get("skin_type_self") || "unknown",
      concerns: fd.getAll("concerns"),
      age: num(fd.get("age")),
      sleep_hours: num(fd.get("sleep_hours")),
      water_liters: num(fd.get("water_liters")),
      sunscreen: fd.get("sunscreen") || "unknown",
      pregnant: fd.get("pregnant") || "na",
      allergies: String(fd.get("allergies") || "").trim(),
      current_routine: String(fd.get("current_routine") || "").trim(),
    };
  }

  function showAnalyzeError(msg) {
    const box = $("#analyze-error");
    box.textContent = msg;
    box.hidden = !msg;
  }

  const SCAN_MESSAGES = ["Đang nhận diện khuôn mặt…", "Đo độ ẩm và sắc tố…", "Đối chiếu với ảnh mẫu…", "Soạn gợi ý sản phẩm…"];
  let scanTimer = null;

  function setBusy(busy) {
    state.busy = busy;
    const btn = $("#btn-analyze");
    btn.disabled = busy;
    btn.innerHTML = busy ? `<span class="spinner" aria-hidden="true"></span> Đang phân tích…` : "Phân tích da của tôi";
    $("#scan-overlay").hidden = !busy;
    clearInterval(scanTimer);
    if (busy) {
      let i = 0;
      $("#scan-msg").textContent = SCAN_MESSAGES[0];
      scanTimer = setInterval(() => { i = (i + 1) % SCAN_MESSAGES.length; $("#scan-msg").textContent = SCAN_MESSAGES[i]; }, 2200);
    }
  }

  $("#q-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.busy) return;
    if (!state.blob) {
      showAnalyzeError("Vui lòng chọn hoặc chụp một ảnh khuôn mặt trước.");
      return;
    }
    showAnalyzeError("");
    setBusy(true);
    try {
      const { analysis, remaining_today } = await Api.analyze(state.blob, collectQuestionnaire(), state.rawFile);
      updateRemaining(remaining_today);
      state.history.unshift(analysis);
      showResult(analysis);
    } catch (err) {
      if (err.data && typeof err.data.remaining_today === "number") updateRemaining(err.data.remaining_today);
      showAnalyzeError(err.message);
    } finally {
      setBusy(false);
    }
  });

  function updateRemaining(n) {
    const badge = $("#remaining-badge");
    if (typeof n !== "number" || n > 50) { badge.hidden = true; return; }
    badge.textContent = `Còn ${n} lượt hôm nay`;
    badge.hidden = false;
  }

  // ============================================================
  // Hiển thị kết quả
  // ============================================================
  function recsHtml(result) {
    const recs = result.recommendations || [];
    if (!recs.length) {
      return `<div class="empty">${result.needs_dermatologist
        ? "Bạn nên gặp bác sĩ da liễu trước khi dùng thêm sản phẩm."
        : "Chưa có gợi ý sản phẩm cho lần phân tích này."}</div>`;
    }
    return recs
      .map(
        (r) => `
      <div class="rec">
        <div class="rec-top">
          <div><div class="rec-name">${esc(r.name)}</div><div class="rec-cat">${esc(r.category)}</div></div>
          <div class="rec-price">${esc(fmtPrice(r.price, r.currency))}</div>
        </div>
        <div class="rec-pills">
          <span class="badge">${esc(r.times_per_day)} lần/ngày</span>
          <span class="badge">${esc(TIMING[r.timing] || "")}</span>
          <span class="badge">Trong ${esc(r.duration_weeks)} tuần</span>
        </div>
        <div class="rec-dose"><b>Liều lượng:</b> ${esc(r.dose)}</div>
        ${r.how ? `<div class="rec-how">${esc(r.how)}</div>` : ""}
        ${r.notes ? `<div class="rec-notes">💡 ${esc(r.notes)}</div>` : ""}
      </div>`
      )
      .join("");
  }

  function ratingListHtml(axes) {
    return axes
      .map((a) => {
        const r = rating(a.value);
        return `<li><span>${esc(a.label)}</span><span class="lvl ${r.cls}">${r.text} · ${Math.round(a.value)}</span></li>`;
      })
      .join("");
  }

  function metricTile(label, value) {
    return `<div class="metric"><div class="k">${esc(label)}</div><div class="v">${value}<small>%</small></div><div class="bar"><i style="width:${value}%"></i></div></div>`;
  }

  function listHtml(items) {
    return items && items.length ? `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  }

  function showResult(a) {
    state.current = a;
    state.reportItem = a;
    const r = a.result, m = r.metrics;

    setPhoto(state.previewUrl || a.image_url);
    $("#form-card").hidden = true;
    $("#howto-card").hidden = true;
    $("#side-results").hidden = false;

    const card = $("#result-card");
    card.hidden = false;
    card.innerHTML = `
      <h2>${esc(headline(m.overall_score))}</h2>
      <p class="summary">${esc(r.summary)}</p>
      ${r.needs_dermatologist ? `<div class="derm-alert" role="alert">⚠️ Kết quả cho thấy bạn nên gặp bác sĩ da liễu để được thăm khám trực tiếp.</div>` : ""}
      <div class="gauge-wrap" id="gauge"></div>
      <div class="metric-tiles">
        ${metricTile("Độ ẩm", m.hydration_pct)}
        ${metricTile("Sắc tố", m.pigmentation_pct)}
        ${metricTile("Độ dầu", m.oil_pct)}
      </div>
      <div class="conf">
        <span class="badge">🤖 Ước tính bởi AI</span>
        <span class="badge">Độ tin cậy ${esc(r.confidence)}%</span>
        <span class="badge">${esc(SKIN_TYPES[r.skin_type] || "")}</span>
      </div>
      ${r.observations && r.observations.length ? `<div class="result-section"><h3>Phân tích định lượng</h3>${listHtml(r.observations)}</div>` : ""}
      ${r.precautions && r.precautions.length ? `<div class="result-section"><h3>Lưu ý</h3>${listHtml(r.precautions)}</div>` : ""}
      <div class="result-actions">
        <button class="btn btn-onGrad" type="button" id="btn-to-recs"><span>Xem lộ trình sử dụng sản phẩm</span><span aria-hidden="true">›</span></button>
        <button class="btn btn-onGrad" type="button" id="btn-to-report"><span>Xem báo cáo đầy đủ</span><span aria-hidden="true">›</span></button>
        <button class="btn btn-onGrad" type="button" id="btn-reanalyze"><span>Phân tích lại với ảnh khác</span><span aria-hidden="true">›</span></button>
      </div>
      <p class="summary" style="margin-top:14px">Nên chụp lại sau khoảng ${esc(r.recheck_after_days)} ngày để so sánh tiến triển.</p>`;
    Charts.gauge($("#gauge"), m.overall_score);

    Charts.radar($("#radar"), radarAxes(m));
    $("#rating-list").innerHTML = ratingListHtml(radarAxes(m));
    $("#recs").innerHTML = recsHtml(r);

    $("#btn-to-recs").addEventListener("click", () => $("#recs").scrollIntoView({ behavior: "smooth", block: "center" }));
    $("#btn-to-report").addEventListener("click", () => setView("report"));
    $("#btn-reanalyze").addEventListener("click", () => resetToInput(true));
    $("#btn-clear-photo").hidden = true;
  }

  function resetToInput(clearPhoto) {
    state.current = null;
    $("#form-card").hidden = false;
    $("#howto-card").hidden = false;
    $("#side-results").hidden = true;
    $("#result-card").hidden = true;
    if (clearPhoto) {
      state.blob = null; state.rawFile = null;
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = "";
      setPhoto("");
    } else {
      setPhoto(state.previewUrl);
    }
  }

  // ============================================================
  // Lịch sử
  // ============================================================
  async function loadHistory() {
    try {
      const data = await Api.history();
      state.history = data.items;
    } catch (e) {
      toast(e.message, "error");
    }
    renderHistory();
  }

  function renderHistory() {
    const list = $("#history-list");
    const items = state.history;
    $("#history-empty").hidden = items.length > 0;
    $("#btn-delete-all").hidden = items.length === 0;

    const asc = items.slice().reverse().map((i) => ({
      date: new Date(i.created_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
      hydration: i.hydration_pct,
      overall: i.overall_score,
    }));
    Charts.trend($("#trend"), asc);

    list.innerHTML = items
      .map(
        (i) => `
      <article class="card h-item" data-id="${i.id}" tabindex="0" role="button" aria-label="Xem báo cáo ngày ${esc(fmtDate(i.created_at))}">
        <img class="h-thumb" src="${esc(i.image_url)}" alt="" loading="lazy">
        <div>
          <div class="h-date">${esc(fmtDate(i.created_at))}</div>
          <div class="h-stats">
            <span>Điểm tổng <b>${i.overall_score}</b></span>
            <span>Độ ẩm <b>${i.hydration_pct}%</b></span>
            <span>Sắc tố <b>${i.pigmentation_pct}%</b></span>
            <span>Độ dầu <b>${i.oil_pct}%</b></span>
          </div>
          <div class="h-actions">
            <button class="btn btn-sm" type="button" data-open="${i.id}">Xem báo cáo</button>
            <button class="btn btn-sm btn-ghost btn-danger" type="button" data-del="${i.id}">Xoá</button>
          </div>
        </div>
      </article>`
      )
      .join("");
  }

  $("#history-list").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    const item = e.target.closest(".h-item");
    if (del) {
      e.stopPropagation();
      if (!confirm("Xoá kết quả này và ảnh liên quan? Hành động không thể hoàn tác.")) return;
      try {
        await Api.remove(Number(del.dataset.del));
        state.history = state.history.filter((i) => i.id !== Number(del.dataset.del));
        if (state.current && state.current.id === Number(del.dataset.del)) resetToInput(true);
        if (state.reportItem && state.reportItem.id === Number(del.dataset.del)) state.reportItem = null;
        renderHistory();
        toast("Đã xoá kết quả.", "ok");
      } catch (err) { toast(err.message, "error"); }
      return;
    }
    if (item) openReport(Number(item.dataset.id));
  });
  $("#history-list").addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("h-item")) {
      e.preventDefault();
      openReport(Number(e.target.dataset.id));
    }
  });

  $("#btn-delete-all").addEventListener("click", async () => {
    if (!confirm("Xoá TOÀN BỘ lịch sử phân tích và ảnh của bạn? Hành động không thể hoàn tác.")) return;
    try {
      await Api.removeAll();
      state.history = [];
      state.reportItem = null;
      resetToInput(true);
      renderHistory();
      toast("Đã xoá toàn bộ lịch sử.", "ok");
    } catch (err) { toast(err.message, "error"); }
  });

  async function openReport(id) {
    try {
      const { analysis } = await Api.detail(id);
      state.reportItem = analysis;
      setView("report");
    } catch (e) { toast(e.message, "error"); }
  }

  // ============================================================
  // Báo cáo
  // ============================================================
  async function renderReportView() {
    const host = $("#report-host");
    let a = state.reportItem || state.current;
    if (!a) {
      if (!state.history.length) { try { state.history = (await Api.history()).items; } catch (_) { /* bỏ qua */ } }
      if (state.history.length) {
        try { a = (await Api.detail(state.history[0].id)).analysis; state.reportItem = a; } catch (_) { /* bỏ qua */ }
      }
    }
    if (!a) {
      host.innerHTML = `<div class="card empty">Chưa có kết quả để lập báo cáo. Hãy thực hiện một lần phân tích trước.<br><br><button class="btn btn-primary" id="btn-go-analyze" type="button">Bắt đầu phân tích</button></div>`;
      $("#btn-go-analyze").addEventListener("click", () => setView("analyze"));
      return;
    }

    const r = a.result, m = r.metrics;
    const axes = radarAxes(m);
    host.innerHTML = `
      <article class="card report">
        <div class="report-head">
          <div>
            <div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c3.6 4.3 6 7.6 6 10.9A6 6 0 0 1 6 13.4C6 10.1 8.4 6.8 12 2.5Z"/></svg></span>${esc(SKIN_CONFIG.brand)}</div>
            <h1 class="page-title" style="margin-top:16px">Báo cáo phân tích da</h1>
            <p class="muted">${esc(state.user ? state.user.name : "")} · ${esc(fmtDate(a.created_at))}</p>
          </div>
          <span class="badge" style="font-size:.9rem;padding:8px 14px">Điểm tổng ${m.overall_score}/100</span>
        </div>
        <div class="report-grid">
          <div>
            ${a.image_url ? `<img class="report-photo" src="${esc(a.image_url)}" alt="Ảnh đã phân tích">` : ""}
            <p class="hint" style="margin-top:8px">Mô hình: ${esc(a.model_version || "")}</p>
          </div>
          <div>
            <table>
              <tr><th>Loại da (AI đánh giá)</th><td>${esc(SKIN_TYPES[r.skin_type] || "")}</td></tr>
              <tr><th>Độ ẩm</th><td><b>${m.hydration_pct}%</b></td></tr>
              <tr><th>Sắc tố không đều</th><td><b>${m.pigmentation_pct}%</b></td></tr>
              <tr><th>Độ dầu</th><td><b>${m.oil_pct}%</b></td></tr>
              <tr><th>Lỗ chân lông (điểm)</th><td>${m.pores_score}/100</td></tr>
              <tr><th>Nếp nhăn (điểm)</th><td>${m.wrinkles_score}/100</td></tr>
              <tr><th>Độ tin cậy của ước tính</th><td>${esc(r.confidence)}%</td></tr>
            </table>
            <div class="radar-wrap" id="report-radar" style="max-width:340px;margin-top:12px"></div>
          </div>
        </div>
        ${r.summary ? `<h3>Nhận xét</h3><p style="font-size:.92rem">${esc(r.summary)}</p>${listHtml(r.observations)}` : ""}
        <h3>Lộ trình sử dụng sản phẩm</h3>
        ${recsHtml(r)}
        ${r.precautions && r.precautions.length ? `<h3>Lưu ý</h3>${listHtml(r.precautions)}` : ""}
        <p class="foot">Kết quả là ước tính từ hình ảnh và thông tin bạn cung cấp do AI thực hiện, không phải chẩn đoán y khoa và không thay thế thiết bị đo chuyên dụng. Nếu da có dấu hiệu bất thường, hãy gặp bác sĩ da liễu. Nên chụp lại sau khoảng ${esc(r.recheck_after_days)} ngày để theo dõi tiến triển.</p>
      </article>`;
    Charts.radar($("#report-radar"), axes);
  }

  // ============================================================
  // Chia sẻ / In
  // ============================================================
  $("#btn-print").addEventListener("click", async () => {
    if (!(state.reportItem || state.current || state.history.length)) return toast("Chưa có kết quả để in.", "error");
    if (state.view !== "report") { setView("report"); await renderReportView(); }
    setTimeout(() => window.print(), 150);
  });

  $("#btn-share").addEventListener("click", async () => {
    const a = state.reportItem || state.current;
    if (!a) return toast("Chưa có kết quả để chia sẻ.", "error");
    const text = Util.summaryText(a);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Kết quả phân tích da", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast("Đã sao chép tóm tắt kết quả vào bộ nhớ tạm.", "ok");
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; // người dùng huỷ
      toast("Không thể chia sẻ trên thiết bị này.", "error");
    }
  });

  // ============================================================
  // Menu người dùng
  // ============================================================
  const menu = $("#user-menu"), userBtn = $("#user-btn");
  function toggleMenu(open) {
    menu.hidden = !open;
    userBtn.setAttribute("aria-expanded", open);
  }
  userBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) toggleMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleMenu(false); });

  $("#btn-logout").addEventListener("click", async () => {
    try { await Api.logout(); } finally { location.href = "index.html"; }
  });
  $("#btn-delete-account").addEventListener("click", async () => {
    if (!confirm("Xoá vĩnh viễn tài khoản cùng toàn bộ ảnh và kết quả phân tích? Hành động không thể hoàn tác.")) return;
    try { await Api.deleteAccount(); location.href = "index.html"; }
    catch (e) { toast(e.message, "error"); }
  });

  // ============================================================
  // Khởi động
  // ============================================================
  async function init() {
    $$("[data-brand]").forEach((el) => (el.textContent = SKIN_CONFIG.brand));
    if (SKIN_CONFIG.demo) $("#demo-banner").hidden = false;
    try {
      const { user } = await Api.me();
      if (!user) { location.replace("index.html"); return; }
      state.user = user;
    } catch (e) {
      toast(e.message, "error");
      return;
    }
    $("#user-name").textContent = state.user.name;
    $("#user-avatar").textContent = (state.user.name || "?").trim().charAt(0).toUpperCase();
    if (state.user.role === "admin") $("#link-admin").hidden = false;
    setView("analyze");
    try { state.history = (await Api.history()).items; } catch (_) { /* tải lại khi mở tab Lịch sử */ }
  }

  init();
})();

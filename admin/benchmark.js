// Trang chấm độ chính xác AI (chỉ admin). Máy chủ chấm từng ảnh một; trình duyệt điều phối vòng lặp và tính sai số.
(function () {
  const { esc, toast, fmtDate } = Util;
  const { KEYS, summarize, verdict, biasText } = BenchMetrics;
  const $ = (s) => document.querySelector(s);

  const MIN_RECOMMENDED = 20;
  const MAX_CONSECUTIVE_FAILS = 3;

  const state = { images: [], runs: [], selectedId: null, running: false, cancelled: false };

  const num1 = (n) => (n == null ? "—" : n.toFixed(1));
  const pct = (n) => (n == null ? "—" : Math.round(n * 100) + "%");
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n * 10) / 10);
  const errCls = (e) => (Math.abs(e) <= 5 ? "err-ok" : Math.abs(e) <= 10 ? "err-mid" : "err-bad");

  function showError(msg) {
    const box = $("#bench-error");
    box.textContent = msg;
    box.hidden = !msg;
  }

  // ---------------- Tải dữ liệu ----------------
  async function load(selectLatest = false) {
    try {
      const data = await Api.benchList();
      state.images = data.images;
      state.runs = data.runs;
      state.maxImages = data.max_images;
      if (selectLatest || !state.runs.some((r) => r.id === state.selectedId)) {
        state.selectedId = state.runs.length ? state.runs[0].id : null;
      }
      renderAll();
    } catch (e) {
      ["#intro-card", "#run-card", "#images-card"].forEach((s) => ($(s).hidden = true));
      showError(e.status === 401 || e.status === 403 ? "Bạn cần đăng nhập bằng tài khoản quản trị." : e.message);
    }
  }

  function renderAll() {
    renderRunSummary();
    renderImages();
    renderRuns();
    renderResult();
  }

  // ---------------- Ảnh kiểm tra ----------------
  function renderImages() {
    const items = state.images;
    $("#img-count").textContent = items.length;
    $("#img-empty").hidden = items.length > 0;
    $("#img-grid").innerHTML = items
      .map(
        (i) => `
      <div class="card ref-item">
        <img src="../${esc(i.image_url)}" alt="Ảnh kiểm tra #${i.id}" loading="lazy">
        <div><b>Ẩm ${i.hydration_pct}%</b> · Sắc tố ${i.pigmentation_pct}% · Dầu ${i.oil_pct}%</div>
        ${i.notes ? `<div class="muted">${esc(i.notes)}</div>` : ""}
        <button class="btn btn-sm btn-ghost btn-danger" type="button" data-del="${i.id}" style="margin-top:6px">Xoá</button>
      </div>`
      )
      .join("");
  }

  $("#img-grid").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;
    if (!confirm("Xoá ảnh kiểm tra này? Các lần chạy cũ vẫn giữ nhãn và điểm đã chấm.")) return;
    try { await Api.benchDelete(Number(btn.dataset.del)); toast("Đã xoá.", "ok"); load(); }
    catch (err) { toast(err.message, "error"); }
  });

  $("#add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    if (!form.image.files[0]) return showError("Vui lòng chọn ảnh.");
    showError("");
    const btn = $("#add-btn");
    btn.disabled = true;
    try {
      const blob = await ImageTools.compress(form.image.files[0], 1568);
      const fd = new FormData(form);
      fd.set("image", blob, "eval.jpg");
      await Api.benchAdd(fd);
      form.reset();
      toast("Đã thêm ảnh kiểm tra.", "ok");
      load();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------------- Chạy đánh giá ----------------
  function renderRunSummary() {
    const n = state.images.length;
    let text = n === 0
      ? "Chưa có ảnh kiểm tra — hãy thêm ảnh có nhãn thật ở cuối trang."
      : `Có ${n} ảnh kiểm tra → mỗi lần chạy gọi Claude API ${n} lần.`;
    if (n > 0 && n < MIN_RECOMMENDED) text += ` Nên có ít nhất ${MIN_RECOMMENDED} ảnh để kết quả đáng tin.`;
    $("#run-summary").textContent = text;
    $("#run-btn").disabled = n === 0 || state.running;
  }

  function setProgress(done, total, text) {
    $("#progress").hidden = false;
    $("#progress-bar").style.width = (total ? (done / total) * 100 : 0) + "%";
    $("#run-status").textContent = text;
  }

  async function scoreOne(runId, imageId) {
    return Api.benchScore(runId, imageId);
  }

  async function runBenchmark() {
    if (state.running) return;
    const n = state.images.length;
    if (!confirm(`Chạy đánh giá trên ${n} ảnh? Sẽ gọi Claude API ${n} lần và tính phí.`)) return;

    showError("");
    state.running = true;
    state.cancelled = false;
    $("#run-btn").disabled = true;
    $("#cancel-btn").hidden = false;
    window.addEventListener("beforeunload", warnLeave);

    let runId = null;
    try {
      const start = await Api.benchStart({ use_references: $("#use-refs").checked, note: $("#run-note").value });
      runId = start.run_id;
      const ids = start.image_ids;
      let done = 0;
      let failed = [];
      let consecutive = 0;
      let lastMsg = "";

      const pass = async (list, label) => {
        const still = [];
        for (const id of list) {
          if (state.cancelled) { still.push(id); continue; }
          try {
            await scoreOne(runId, id);
            consecutive = 0;
            done++;
          } catch (e) {
            still.push(id);
            lastMsg = e.message;
            if (++consecutive >= MAX_CONSECUTIVE_FAILS) { state.cancelled = true; }
          }
          setProgress(done, ids.length, `${label} ${done}/${ids.length}${still.length ? ` · lỗi ${still.length}` : ""}`);
        }
        return still;
      };

      setProgress(0, ids.length, `Đang chấm 0/${ids.length}…`);
      failed = await pass(ids, "Đang chấm");
      if (failed.length && !state.cancelled) {
        setProgress(done, ids.length, `Thử lại ${failed.length} ảnh lỗi…`);
        await new Promise((r) => setTimeout(r, 3000));
        failed = await pass(failed, "Thử lại");
      }
      await Api.benchFinish(runId);

      if (failed.length) {
        showError(`${failed.length}/${ids.length} ảnh chưa chấm được${lastMsg ? ` (${lastMsg})` : ""}. ` +
          (state.cancelled ? "Lần chạy đã dừng sớm; kết quả bên dưới chỉ tính các ảnh đã chấm." : ""));
      } else {
        toast("Đã chấm xong.", "ok");
      }
      $("#run-status").textContent = "";
      $("#progress").hidden = true;
      await load(true);
      $("#result-card").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      showError(e.message);
      if (runId) { try { await Api.benchFinish(runId); } catch (_) { /* bỏ qua */ } }
      $("#progress").hidden = true;
      $("#run-status").textContent = "";
      await load(!!runId);
    } finally {
      state.running = false;
      $("#cancel-btn").hidden = true;
      window.removeEventListener("beforeunload", warnLeave);
      renderRunSummary();
    }
  }

  function warnLeave(e) { e.preventDefault(); e.returnValue = ""; }

  $("#run-btn").addEventListener("click", runBenchmark);
  $("#cancel-btn").addEventListener("click", () => {
    state.cancelled = true;
    $("#run-status").textContent = "Đang dừng sau ảnh hiện tại…";
  });

  // ---------------- Kết quả một lần chạy ----------------
  function renderResult() {
    const run = state.runs.find((r) => r.id === state.selectedId);
    $("#result-card").hidden = !run;
    if (!run) return;

    const S = summarize(run.results);
    $("#result-title").textContent = `Lần chạy #${run.id}`;
    const refs = run.use_references ? `${run.reference_count} ảnh mẫu` : "không dùng ảnh mẫu";
    let sub = `${fmtDate(run.started_at)} · ${run.model_version} · ${refs}`;
    if (run.note) sub += ` · “${run.note}”`;
    const prev = state.runs.filter((r) => r.id < run.id && r.finished_at)[0];
    if (prev && S.overall_mae != null) {
      const P = summarize(prev.results);
      if (P.overall_mae != null) {
        const d = S.overall_mae - P.overall_mae;
        sub += ` · so với #${prev.id}: ${Math.abs(d) < 0.05 ? "không đổi" : d < 0 ? `tốt hơn ${Math.abs(d).toFixed(1)} điểm` : `kém hơn ${d.toFixed(1)} điểm`}`;
      }
    }
    $("#result-sub").textContent = sub;
    $("#result-verdict").innerHTML = S.overall_mae == null
      ? `<span class="lvl-mid">Chưa có ảnh nào được chấm</span>`
      : `Sai số TB <b>${num1(S.overall_mae)}</b> điểm · <span class="${S.verdict.cls}">${S.verdict.text}</span>`;

    const warns = [];
    if (!run.finished_at) warns.push("Lần chạy này bị gián đoạn — chỉ tính các ảnh đã chấm.");
    if (S.scored > 0 && S.scored < MIN_RECOMMENDED) warns.push(`Chỉ ${S.scored} ảnh được chấm (nên ≥ ${MIN_RECOMMENDED}) — kết quả chỉ để tham khảo.`);
    if (S.rejected > 0) warns.push(`${S.rejected} ảnh bị AI từ chối (không thấy mặt / chất lượng kém) và không tính vào sai số.`);
    $("#warn-box").innerHTML = warns.map((w) => `<div class="alert alert-warn" style="margin-bottom:8px">${esc(w)}</div>`).join("");

    $("#stat-tiles").innerHTML = KEYS.map(({ key, label }) => {
      const m = S.metrics[key];
      if (!m.n) return `<div class="stat-card"><div class="k">${label}</div><div class="big">—</div></div>`;
      const v = verdict(m.mae);
      return `
        <div class="stat-card">
          <div class="k">${label}</div>
          <div class="big">${num1(m.mae)} <small>điểm lệch TB</small></div>
          <div class="${v.cls}" style="font-weight:800;font-size:.85rem">${v.text}</div>
          <dl>
            <dt>Lệch hệ thống</dt><dd>${signed(m.bias)}</dd>
            <dt>Trong ±5</dt><dd>${pct(m.within5)}</dd>
            <dt>Trong ±10</dt><dd>${pct(m.within10)}</dd>
            <dt>Tương quan r</dt><dd>${m.r == null ? "—" : m.r.toFixed(2)}</dd>
            <dt>Số ảnh</dt><dd>${m.n}</dd>
          </dl>
          <div class="bias">${esc(biasText(m.bias))}</div>
        </div>`;
    }).join("");

    $("#scatter-row").innerHTML = KEYS.map(({ key, label }) => `<figure id="sc-${key}"><div></div><figcaption>${label}</figcaption></figure>`).join("");
    KEYS.forEach(({ key, label }) => {
      const m = S.metrics[key];
      const host = $(`#sc-${key} div`);
      if (m.n) Charts.scatter(host, m.points, `Biểu đồ nhãn thật và AI chấm: ${label}`);
      else host.innerHTML = `<div class="empty">Chưa có dữ liệu</div>`;
    });

    const imgById = new Map(state.images.map((i) => [i.id, i]));
    const head = `<tr><th>Ảnh</th>${KEYS.map(({ label }) => `<th class="num">${label} thật</th><th class="num">AI</th><th class="num">Lệch</th>`).join("")}</tr>`;
    const rows = run.results.map((r) => {
      const img = imgById.get(r.image_id);
      const thumb = img ? `<img class="mini" src="../${esc(img.image_url)}" alt="" loading="lazy">` : `<span class="muted">đã xoá</span>`;
      if (r.pred_hydration == null) {
        return `<tr><td>${thumb}</td><td colspan="${KEYS.length * 3}" class="err-bad" style="white-space:normal">Bị từ chối: ${esc(r.error || "")}</td></tr>`;
      }
      return `<tr><td>${thumb}</td>${KEYS.map(({ key }) => {
        const t = r["true_" + key], p = r["pred_" + key], e = p - t;
        return `<td class="num">${t}</td><td class="num">${p}</td><td class="num ${errCls(e)}">${signed(e)}</td>`;
      }).join("")}</tr>`;
    });
    $("#result-table").innerHTML = head + rows.join("");
  }

  // ---------------- Lịch sử chạy ----------------
  function renderRuns() {
    $("#runs-card").hidden = state.runs.length === 0;
    const head = `<tr><th>#</th><th>Thời gian</th><th>Model</th><th>Ảnh mẫu</th><th class="num">Đã chấm</th>${KEYS.map(({ label }) => `<th class="num">MAE ${label}</th>`).join("")}<th class="num">MAE TB</th><th>Ghi chú</th><th></th></tr>`;
    const rows = state.runs.map((run) => {
      const S = summarize(run.results);
      return `<tr class="${run.id === state.selectedId ? "sel" : ""}">
        <td><b>#${run.id}</b></td>
        <td>${esc(fmtDate(run.started_at))}${run.finished_at ? "" : ` <span class="err-mid">(dở dang)</span>`}</td>
        <td>${esc(run.model_version)}</td>
        <td>${run.use_references ? run.reference_count : "không"}</td>
        <td class="num">${S.scored}/${S.total}</td>
        ${KEYS.map(({ key }) => `<td class="num">${num1(S.metrics[key].mae)}</td>`).join("")}
        <td class="num"><b class="${S.verdict.cls}">${num1(S.overall_mae)}</b></td>
        <td style="white-space:normal;max-width:220px">${esc(run.note)}</td>
        <td><button class="btn btn-sm" type="button" data-view="${run.id}">Xem</button>
            <button class="btn btn-sm btn-ghost btn-danger" type="button" data-delrun="${run.id}">Xoá</button></td>
      </tr>`;
    });
    $("#runs-table").innerHTML = head + rows.join("");
  }

  $("#runs-table").addEventListener("click", async (e) => {
    const view = e.target.closest("[data-view]");
    const del = e.target.closest("[data-delrun]");
    if (view) {
      state.selectedId = Number(view.dataset.view);
      renderRuns();
      renderResult();
      $("#result-card").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (del) {
      if (!confirm("Xoá lần chạy này khỏi lịch sử?")) return;
      try { await Api.benchDeleteRun(Number(del.dataset.delrun)); load(); }
      catch (err) { toast(err.message, "error"); }
    }
  });

  Api.me().then(() => load(true)).catch((e) => showError(e.message));
})();

// Trang quản trị ảnh mẫu (chỉ admin). Đường dẫn ảnh do API trả về tương đối từ thư mục gốc → thêm "../".
(function () {
  const { esc, toast, fmtDate } = Util;
  const $ = (s) => document.querySelector(s);

  function showError(msg) {
    const box = $("#admin-error");
    box.textContent = msg;
    box.hidden = !msg;
  }

  async function load() {
    try {
      const { items } = await Api.adminList();
      $("#ref-count").textContent = items.length;
      $("#ref-empty").hidden = items.length > 0;
      $("#ref-grid").innerHTML = items
        .map(
          (i) => `
        <div class="card ref-item">
          <img src="../${esc(i.image_url)}" alt="Ảnh mẫu #${i.id}" loading="lazy">
          <div><b>Ẩm ${i.hydration_pct}%</b> · Sắc tố ${i.pigmentation_pct}% · Dầu ${i.oil_pct}%</div>
          ${i.notes ? `<div class="muted">${esc(i.notes)}</div>` : ""}
          <div class="muted" style="font-size:.72rem">${esc(fmtDate(i.created_at, false))}</div>
          <button class="btn btn-sm btn-ghost btn-danger" type="button" data-del="${i.id}" style="margin-top:6px">Xoá</button>
        </div>`
        )
        .join("");
    } catch (e) {
      $("#add-card").hidden = true;
      showError(e.status === 401 ? "Bạn cần đăng nhập bằng tài khoản quản trị." : e.message);
    }
  }

  $("#ref-grid").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-del]");
    if (!btn || !confirm("Xoá ảnh mẫu này?")) return;
    try { await Api.adminDelete(Number(btn.dataset.del)); toast("Đã xoá.", "ok"); load(); }
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
      // Nén ở trình duyệt trước khi tải lên (máy chủ vẫn tự thu nhỏ lại).
      const blob = await ImageTools.compress(form.image.files[0], 1024);
      const fd = new FormData(form);
      fd.set("image", blob, "ref.jpg");
      await Api.adminAdd(fd);
      form.reset();
      toast("Đã thêm ảnh mẫu.", "ok");
      load();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  Api.me().then(load).catch((e) => showError(e.message));
})();

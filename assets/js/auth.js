// Trang chào: đăng nhập / đăng ký.
(function () {
  const $ = (s) => document.querySelector(s);
  const tabLogin = $("#tab-login"), tabReg = $("#tab-register");
  const formLogin = $("#form-login"), formReg = $("#form-register");
  const errBox = $("#auth-error");

  document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = SKIN_CONFIG.brand));

  function showError(msg) {
    errBox.textContent = msg;
    errBox.hidden = !msg;
  }

  function select(which) {
    const login = which === "login";
    tabLogin.setAttribute("aria-selected", login);
    tabReg.setAttribute("aria-selected", !login);
    formLogin.hidden = !login;
    formReg.hidden = login;
    showError("");
  }
  tabLogin.addEventListener("click", () => select("login"));
  tabReg.addEventListener("click", () => select("register"));

  async function submit(form, call, payload) {
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    showError("");
    try {
      await call(payload);
      location.href = "app.html";
    } catch (e) {
      showError(e.message);
      btn.disabled = false;
    }
  }

  formLogin.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(formLogin);
    if (!d.get("email") || !d.get("password")) return showError("Vui lòng nhập email và mật khẩu.");
    submit(formLogin, Api.login, { email: d.get("email"), password: d.get("password") });
  });

  formReg.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(formReg);
    if (!d.get("name") || !d.get("email")) return showError("Vui lòng nhập họ tên và email.");
    if (String(d.get("password") || "").length < 8) return showError("Mật khẩu cần từ 8 ký tự.");
    if (!d.get("consent")) return showError("Bạn cần đồng ý cho phép xử lý ảnh và dữ liệu da để tiếp tục.");
    submit(formReg, Api.register, {
      name: d.get("name"),
      email: d.get("email"),
      password: d.get("password"),
      consent: true,
    });
  });

  // Đã đăng nhập rồi thì vào thẳng ứng dụng; đồng thời lấy CSRF token cho form.
  Api.me()
    .then((data) => { if (data.user) location.replace("app.html"); })
    .catch(() => showError("Không kết nối được máy chủ. Vui lòng thử lại sau."));
})();

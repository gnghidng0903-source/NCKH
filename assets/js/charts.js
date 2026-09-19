// Biểu đồ SVG thuần: gauge điểm tổng, radar 5 trục, đường xu hướng.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const rad = (deg) => (deg * Math.PI) / 180;
  const pt = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
  const f = (n) => n.toFixed(2);

  function arcPath(cx, cy, r, startDeg, endDeg) {
    const [x1, y1] = pt(cx, cy, r, startDeg);
    const [x2, y2] = pt(cx, cy, r, endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${f(x1)} ${f(y1)} A ${r} ${r} 0 ${large} 1 ${f(x2)} ${f(y2)}`;
  }

  function svg(viewBox, inner, label) {
    return `<svg xmlns="${NS}" viewBox="${viewBox}" role="img" aria-label="${label}">${inner}</svg>`;
  }

  const Charts = {
    // Gauge cung 240° ở giữa, số điểm lớn.
    gauge(el, value, label = "Điểm tổng") {
      const v = Math.max(0, Math.min(100, value));
      const cx = 110, cy = 105, r = 86, start = 150, sweep = 240;
      const track = arcPath(cx, cy, r, start, start + sweep);
      const prog = v > 0 ? arcPath(cx, cy, r, start, start + (sweep * Math.max(v, 1)) / 100) : "";
      const [ex, ey] = pt(cx, cy, r, start + (sweep * v) / 100);
      el.innerHTML = svg(
        "0 0 220 170",
        `<path d="${track}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="12" stroke-linecap="round"/>
         ${prog ? `<path d="${prog}" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>` : ""}
         <circle cx="${f(ex)}" cy="${f(ey)}" r="7" fill="#fff" stroke="rgba(226,80,143,.55)" stroke-width="3"/>
         <text x="${cx}" y="${cy - 36}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.85)" font-weight="600">${label}</text>
         <text x="${cx}" y="${cy + 24}" text-anchor="middle" font-size="58" fill="#fff" font-weight="800">${Math.round(v)}</text>`,
        `${label}: ${Math.round(v)} trên 100`
      );
    },

    // axes: [{label, value 0..100}]
    radar(el, axes) {
      const cx = 150, cy = 130, R = 84, n = axes.length;
      const ang = (i) => -90 + (360 / n) * i;
      let grid = "";
      [25, 50, 75, 100].forEach((p) => {
        const pts = axes.map((_, i) => pt(cx, cy, (R * p) / 100, ang(i)).map(f).join(",")).join(" ");
        grid += `<polygon points="${pts}" fill="none" stroke="rgba(90,60,110,.14)" stroke-width="1"/>`;
      });
      axes.forEach((_, i) => {
        const [x, y] = pt(cx, cy, R, ang(i));
        grid += `<line x1="${cx}" y1="${cy}" x2="${f(x)}" y2="${f(y)}" stroke="rgba(90,60,110,.10)"/>`;
      });
      const poly = axes.map((a, i) => pt(cx, cy, (R * Math.max(4, a.value)) / 100, ang(i)).map(f).join(",")).join(" ");
      const dots = axes
        .map((a, i) => {
          const [x, y] = pt(cx, cy, (R * Math.max(4, a.value)) / 100, ang(i));
          return `<circle cx="${f(x)}" cy="${f(y)}" r="3.5" fill="#e8722f"/>`;
        })
        .join("");
      const labels = axes
        .map((a, i) => {
          const [x, y] = pt(cx, cy, R + 22, ang(i));
          const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
          return `<text x="${f(x)}" y="${f(y - 2)}" text-anchor="${anchor}" font-size="10" fill="#8b8196" font-weight="600">${a.label}</text>
                  <text x="${f(x)}" y="${f(y + 11)}" text-anchor="${anchor}" font-size="12" fill="#2b2231" font-weight="800">${Math.round(a.value)}</text>`;
        })
        .join("");
      el.innerHTML = svg(
        "-30 0 360 262",
        `${grid}<polygon points="${poly}" fill="rgba(232,114,47,.22)" stroke="#e8722f" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}`,
        "Biểu đồ radar các chỉ số da"
      );
    },

    // points: [{date, hydration, overall}] tăng dần theo thời gian.
    trend(el, points) {
      if (points.length < 2) {
        el.innerHTML = `<div class="empty">Cần ít nhất 2 lần phân tích để xem xu hướng.</div>`;
        return;
      }
      const W = 640, H = 210, L = 34, Rr = 16, T = 14, B = 34;
      const x = (i) => L + ((W - L - Rr) * i) / (points.length - 1);
      const y = (v) => T + (H - T - B) * (1 - v / 100);
      let grid = "";
      [0, 25, 50, 75, 100].forEach((g) => {
        grid += `<line x1="${L}" x2="${W - Rr}" y1="${f(y(g))}" y2="${f(y(g))}" stroke="rgba(90,60,110,.10)"/>
                 <text x="${L - 6}" y="${f(y(g) + 4)}" text-anchor="end" font-size="10" fill="#8b8196">${g}</text>`;
      });
      const line = (key, color) => {
        const d = points.map((p, i) => `${i ? "L" : "M"} ${f(x(i))} ${f(y(p[key]))}`).join(" ");
        const dots = points.map((p, i) => `<circle cx="${f(x(i))}" cy="${f(y(p[key]))}" r="3.5" fill="${color}"/>`).join("");
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
      };
      const step = Math.max(1, Math.ceil(points.length / 6));
      const xl = points
        .map((p, i) =>
          i % step === 0 || i === points.length - 1
            ? `<text x="${f(x(i))}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#8b8196">${p.date}</text>`
            : ""
        )
        .join("");
      el.innerHTML = svg("0 0 640 210", grid + line("overall", "#dd4f9c") + line("hydration", "#e8722f") + xl, "Xu hướng độ ẩm và điểm tổng theo thời gian");
    },
  };

  window.Charts = Charts;
})();

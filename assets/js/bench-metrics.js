// Tính các chỉ số sai số của AI so với nhãn thật. Thuần hàm, không phụ thuộc DOM.
(function () {
  const KEYS = [
    { key: "hydration", label: "Độ ẩm" },
    { key: "pigmentation", label: "Sắc tố" },
    { key: "oil", label: "Độ dầu" },
  ];

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  function pearson(xs, ys) {
    if (xs.length < 3) return null;
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    if (sxx === 0 || syy === 0) return null; // một dãy không đổi → không xác định
    return sxy / Math.sqrt(sxx * syy);
  }

  // rows: [{true_<key>, pred_<key>|null, ...}]
  function metric(rows, key) {
    const pairs = rows
      .filter((r) => r["pred_" + key] != null)
      .map((r) => ({ t: r["true_" + key], p: r["pred_" + key] }));
    if (!pairs.length) return { n: 0 };
    const errs = pairs.map((x) => x.p - x.t);
    const abs = errs.map(Math.abs);
    return {
      n: pairs.length,
      mae: mean(abs),
      bias: mean(errs),
      rmse: Math.sqrt(mean(errs.map((e) => e * e))),
      within5: abs.filter((e) => e <= 5).length / pairs.length,
      within10: abs.filter((e) => e <= 10).length / pairs.length,
      r: pearson(pairs.map((x) => x.t), pairs.map((x) => x.p)),
      points: pairs,
    };
  }

  // Ngưỡng gợi ý (điểm trên thang 0–100) — điều chỉnh theo độ tin cậy của nhãn bạn dùng.
  function verdict(mae) {
    if (mae == null) return { text: "Chưa đủ dữ liệu", cls: "lvl-mid" };
    if (mae <= 8) return { text: "Tốt", cls: "lvl-good" };
    if (mae <= 12) return { text: "Chấp nhận được", cls: "lvl-mid" };
    return { text: "Cần cải thiện", cls: "lvl-low" };
  }

  function biasText(bias) {
    if (bias == null) return "";
    if (Math.abs(bias) < 2) return "Không lệch hệ thống đáng kể";
    const v = Math.abs(bias).toFixed(1);
    return bias > 0 ? `Thường chấm CAO hơn thực tế ~${v} điểm` : `Thường chấm THẤP hơn thực tế ~${v} điểm`;
  }

  function summarize(results) {
    const total = results.length;
    const scored = results.filter((r) => r.pred_hydration != null).length;
    const metrics = {};
    KEYS.forEach(({ key }) => (metrics[key] = metric(results, key)));
    const maes = KEYS.map(({ key }) => metrics[key].mae).filter((v) => v != null);
    const overall = maes.length ? mean(maes) : null;
    return {
      total,
      scored,
      rejected: total - scored, // AI từ chối vì ảnh không phải mặt / chất lượng kém
      metrics,
      overall_mae: overall,
      verdict: verdict(overall),
    };
  }

  window.BenchMetrics = { KEYS, summarize, metric, pearson, verdict, biasText };
})();

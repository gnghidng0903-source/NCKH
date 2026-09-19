// Nén/thu nhỏ ảnh ngay trên trình duyệt: giảm dung lượng upload và loại bỏ EXIF (vị trí, thiết bị).
(function () {
  async function load(file) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (_) { /* dùng phương án dự phòng */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Không đọc được ảnh.")); };
      img.src = url;
    });
  }

  function draw(src, maxSide) {
    const w = src.width, h = src.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const ImageTools = {
    MAX_INPUT_BYTES: 25 * 1024 * 1024,

    async compress(file, maxSide = 1568, quality = 0.88) {
      if (!/^image\//.test(file.type)) throw new Error("Vui lòng chọn một tệp ảnh.");
      if (file.size > ImageTools.MAX_INPUT_BYTES) throw new Error("Ảnh quá lớn (tối đa 25 MB).");
      const src = await load(file);
      if (Math.min(src.width, src.height) < 200) throw new Error("Ảnh quá nhỏ (tối thiểu 200×200 px).");
      const canvas = draw(src, maxSide);
      return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không xử lý được ảnh."))), "image/jpeg", quality)
      );
    },

    // Ảnh nhỏ dạng data URL (dùng cho chế độ demo).
    async thumbnail(file, maxSide = 360) {
      const src = await load(file);
      return draw(src, maxSide).toDataURL("image/jpeg", 0.8);
    },
  };

  window.ImageTools = ImageTools;
})();

// 画像を canvas に contain で描画するヘルパー
function drawImageContain(ctx, img, canvasWidth, canvasHeight) {
  if (!img.naturalWidth || !img.naturalHeight) return;

  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = canvasWidth / canvasHeight;

  let drawWidth, drawHeight, offsetX, offsetY;

  if (imgRatio > canvasRatio) {
    // 画像の方が横長 → 幅に合わせる
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / imgRatio;
    offsetX = 0;
    offsetY = (canvasHeight - drawHeight) / 2;
  } else {
    // 画像の方が縦長 → 高さに合わせる
    drawHeight = canvasHeight;
    drawWidth = canvasHeight * imgRatio;
    offsetX = (canvasWidth - drawWidth) / 2;
    offsetY = 0;
  }

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

function shoot() {
  if (!stream) {
    alert("カメラが起動していません");
    return;
  }

  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");

  // カメラ映像は全面に描画（cover相当）
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // オーバーレイは contain で中央配置
  if (overlay.style.display !== "none" && overlay.src && overlay.complete) {
    ctx.globalAlpha = currentOpacity;
    try {
      drawImageContain(ctx, overlay, canvas.width, canvas.height);
    } catch (e) {
      console.warn("合成失敗", e);
    }
    ctx.globalAlpha = 1;
  }

  // 合成結果を一時表示
  canvas.style.display = "block";
  video.style.display = "none";
  overlay.style.display = "none";

  const a = document.createElement("a");
  a.download = "photo_" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".png";
  a.href = canvas.toDataURL("image/png");
  a.click();

  // 約1秒後にカメラへ戻す
  setTimeout(function() {
    canvas.style.display = "none";
    video.style.display = "block";

    const index = parseInt(overlaySelect.value);
    if (!isNaN(index) && overlays[index] && overlays[index].src) {
      overlay.style.display = "block";
    }
  }, 1000);
}

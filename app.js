const FOLDER_STORAGE_KEY = "dropbox_completed_folders";
const IMAGE_STORAGE_KEY = "dropbox_completed_images";

let stream = null;
let currentOpacity = 0.5;
let overlays = [{ name: "なし", src: "", path: "" }];
let folderList = [];

const video = document.getElementById("camera");
const overlay = document.getElementById("overlay");
const canvas = document.getElementById("canvas");
const folderSelect = document.getElementById("folderSelect");
const overlaySelect = document.getElementById("overlaySelect");
const folderCompleteCheck = document.getElementById("folderCompleteCheck");
const imageCompleteCheck = document.getElementById("imageCompleteCheck");
const statusEl = document.getElementById("status");

function loadList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch (e) {
    return [];
  }
}

function saveList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

function isFolderCompleted(path) {
  return loadList(FOLDER_STORAGE_KEY).indexOf(path) !== -1;
}

function isImageCompleted(path) {
  if (!path) return false;
  return loadList(IMAGE_STORAGE_KEY).indexOf(path) !== -1;
}

async function dropboxApi(endpoint, body) {
  const res = await fetch("https://api.dropboxapi.com/2/" + endpoint, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + ACCESS_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(data, null, 2));
  }
  return data;
}

async function listAllEntries(path, recursive) {
  let entries = [];
  let data = await dropboxApi("files/list_folder", {
    path: path,
    recursive: !!recursive
  });
  entries = entries.concat(data.entries || []);

  while (data.has_more) {
    data = await dropboxApi("files/list_folder/continue", {
      cursor: data.cursor
    });
    entries = entries.concat(data.entries || []);
  }
  return entries;
}

function getDepth(path) {
  const root = (FOLDER_PATH || "").replace(/\/$/, "").toLowerCase();
  let rel = path.toLowerCase();
  if (root && rel.indexOf(root) === 0) {
    rel = rel.slice(root.length);
  }
  rel = rel.replace(/^\//, "");
  if (!rel) return 0;
  return rel.split("/").filter(Boolean).length;
}

function toggleFolderComplete() {
  const path = folderSelect.value;
  if (!path) return;

  let list = loadList(FOLDER_STORAGE_KEY);
  if (folderCompleteCheck.checked) {
    if (list.indexOf(path) === -1) list.push(path);
  } else {
    list = list.filter(function(p) { return p !== path; });
  }
  saveList(FOLDER_STORAGE_KEY, list);
  renderFolderSelect(path);
  statusEl.textContent = folderCompleteCheck.checked
    ? "フォルダを完了済みにしました"
    : "フォルダの完了を解除しました";
}

function toggleImageComplete() {
  const index = parseInt(overlaySelect.value);
  if (isNaN(index) || !overlays[index] || !overlays[index].path) {
    imageCompleteCheck.checked = false;
    return;
  }

  const path = overlays[index].path;
  let list = loadList(IMAGE_STORAGE_KEY);

  if (imageCompleteCheck.checked) {
    if (list.indexOf(path) === -1) list.push(path);
  } else {
    list = list.filter(function(p) { return p !== path; });
  }

  saveList(IMAGE_STORAGE_KEY, list);
  renderOverlaySelect(index);
  statusEl.textContent = imageCompleteCheck.checked
    ? "画像を完了済みにしました: " + overlays[index].name
    : "画像の完了を解除しました: " + overlays[index].name;
}

function renderFolderSelect(selectedPath) {
  folderSelect.innerHTML = "";
  folderList.forEach(function(folder) {
    const option = document.createElement("option");
    option.value = folder.path;
    const indent = "　".repeat(folder.depth);
    const mark = isFolderCompleted(folder.path) ? "✅ " : "📁 ";
    option.textContent = indent + mark + folder.name;
    folderSelect.appendChild(option);
  });
  if (selectedPath) folderSelect.value = selectedPath;
  folderCompleteCheck.checked = selectedPath ? isFolderCompleted(selectedPath) : false;
}

function renderOverlaySelect(selectedIndex) {
  overlaySelect.innerHTML = "";
  for (let i = 0; i < overlays.length; i++) {
    const item = overlays[i];
    const option = document.createElement("option");
    option.value = i;
    if (!item.path) {
      option.textContent = item.name;
    } else {
      const mark = isImageCompleted(item.path) ? "✅ " : "🖼️ ";
      option.textContent = mark + item.name;
    }
    overlaySelect.appendChild(option);
  }
  if (typeof selectedIndex === "number" && !isNaN(selectedIndex)) {
    overlaySelect.value = String(selectedIndex);
  }
  syncImageCompleteCheck();
}

function syncImageCompleteCheck() {
  const index = parseInt(overlaySelect.value);
  if (isNaN(index) || !overlays[index] || !overlays[index].path) {
    imageCompleteCheck.checked = false;
    imageCompleteCheck.disabled = true;
    return;
  }
  imageCompleteCheck.disabled = false;
  imageCompleteCheck.checked = isImageCompleted(overlays[index].path);
}

function initOverlaySelect() {
  renderOverlaySelect(0);
}

async function initDropbox() {
  statusEl.textContent = "フォルダツリーを読み込み中...";
  folderSelect.innerHTML = "";
  overlaySelect.innerHTML = '<option value="">フォルダを選択</option>';
  overlays = [{ name: "なし", src: "", path: "" }];
  overlay.style.display = "none";
  folderList = [];
  imageCompleteCheck.checked = false;
  imageCompleteCheck.disabled = true;

  try {
    const entries = await listAllEntries(FOLDER_PATH, true);
    const folders = entries.filter(function(e) {
      return e[".tag"] === "folder";
    });
    folders.sort(function(a, b) {
      return a.path_lower.localeCompare(b.path_lower);
    });

    folderList.push({
      path: FOLDER_PATH,
      name: "（ルート）",
      depth: 0
    });

    folders.forEach(function(folder) {
      folderList.push({
        path: folder.path_lower,
        name: folder.name,
        depth: getDepth(folder.path_lower)
      });
    });

    renderFolderSelect(FOLDER_PATH);
    statusEl.textContent = "フォルダ " + folderList.length + " 個を読み込みました";
    await loadImagesFromPath(FOLDER_PATH);
  } catch (err) {
    console.error(err);
    let msg = err.message || String(err);
    if (msg.includes("path/not_found")) {
      msg = "フォルダが見つかりません。\nconfig の FOLDER_PATH を確認してください。\nApp folder の場合は \"\"（空文字）にしてください。";
    }
    statusEl.textContent = "エラー: " + msg;
    alert("フォルダの読み込みに失敗しました\n\n" + msg);
  }
}

async function onFolderChange() {
  const path = folderSelect.value;
  if (!path && path !== "") return;
  folderCompleteCheck.checked = isFolderCompleted(path);
  await loadImagesFromPath(path);
}

// 画像読み込みを並列化 + 最初の画像を自動表示
async function loadImagesFromPath(path) {
  statusEl.textContent = "画像を読み込み中... " + path;
  overlays = [{ name: "なし", src: "", path: "" }];
  overlay.style.display = "none";
  imageCompleteCheck.checked = false;
  imageCompleteCheck.disabled = true;

  try {
    const entries = await listAllEntries(path, false);
    const imageFiles = entries.filter(function(entry) {
      return entry[".tag"] === "file" &&
             /\.(png|jpe?g|gif|webp)$/i.test(entry.name);
    });

    if (imageFiles.length === 0) {
      statusEl.textContent = "このフォルダに画像がありません";
      initOverlaySelect();
      return;
    }

    const linkPromises = imageFiles.map(async function(file) {
      try {
        const linkData = await dropboxApi("files/get_temporary_link", {
          path: file.path_lower
        });
        if (linkData.link) {
          return {
            name: file.name,
            src: linkData.link,
            path: file.path_lower
          };
        }
      } catch (e) {
        console.warn("リンク取得失敗:", file.name, e);
      }
      return null;
    });

    const results = await Promise.all(linkPromises);
    results.forEach(function(item) {
      if (item) overlays.push(item);
    });

    statusEl.textContent = "成功！ " + (overlays.length - 1) + " 枚の画像を読み込みました";

    // ★ 最初の画像を自動選択して表示
    if (overlays.length > 1) {
      renderOverlaySelect(1);
      changeOverlay();
    } else {
      initOverlaySelect();
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = "エラー: " + err.message;
    alert("画像の読み込みに失敗しました\n\n" + err.message);
  }
}

// ★ カメラ起動（安定重視版）
async function startCamera() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("このブラウザはカメラに対応していません");
    }

    if (stream) {
      stream.getTracks().forEach(function(t) { t.stop(); });
      stream = null;
    }

    statusEl.textContent = "カメラ起動中...";

    // 安定しやすい順に試す
    const constraintsList = [
      { video: { facingMode: "environment" } },
      { video: { facingMode: { ideal: "environment" } } },
      { video: true }
    ];

    let lastError = null;
    for (let i = 0; i < constraintsList.length; i++) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraintsList[i]);
        break;
      } catch (e) {
        lastError = e;
        console.warn("カメラ制約失敗:", e.name, e.message);
      }
    }

    if (!stream) {
      throw lastError || new Error("カメラを取得できませんでした");
    }

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.style.display = "block";

    // ★ これが無いとスマホで黒画面になりやすい
    await video.play();

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    const w = settings.width || video.videoWidth || "?";
    const h = settings.height || video.videoHeight || "?";
    statusEl.textContent = "カメラ起動成功 (" + w + "×" + h + ")";
    console.log("カメラ成功:", settings);

  } catch (e) {
    console.error("カメラエラー:", e);
    let msg = e.message || e.name || String(e);

    if (e.name === "NotAllowedError") {
      msg = "カメラの使用が拒否されています。ブラウザの設定で許可してください。";
    } else if (e.name === "NotFoundError") {
      msg = "カメラが見つかりません。";
    } else if (e.name === "NotReadableError") {
      msg = "カメラが他のアプリで使用中です。";
    }

    statusEl.textContent = "カメラエラー: " + msg;
    alert("カメラを起動できませんでした\n\n" + msg);
  }
}

function changeOverlay() {
  const index = parseInt(overlaySelect.value);
  if (isNaN(index) || !overlays[index]) return;

  const selected = overlays[index];
  syncImageCompleteCheck();

  overlay.onload = null;
  overlay.onerror = null;
  overlay.src = "";
  overlay.style.display = "none";

  if (selected.src) {
    // 表示を安定させるため crossOrigin は付けない
    overlay.removeAttribute("crossorigin");

    overlay.onload = function() {
      overlay.style.display = "block";
      updateOpacity(document.getElementById("opacitySlider").value);
      statusEl.textContent = "オーバーレイ表示中: " + selected.name +
        " (" + overlay.naturalWidth + "×" + overlay.naturalHeight + ")";
    };

    overlay.onerror = function() {
      overlay.style.display = "none";
      statusEl.textContent = "画像の読み込みに失敗: " + selected.name;
      console.warn("オーバーレイ読み込み失敗", selected.src);
    };

    overlay.src = selected.src;
  } else {
    overlay.style.display = "none";
    statusEl.textContent = "オーバーレイなし";
  }
}

function updateOpacity(value) {
  currentOpacity = value / 100;
  overlay.style.opacity = currentOpacity;
  document.getElementById("opacityValue").textContent = value + "%";
}

function drawImageContain(ctx, img, canvasWidth, canvasHeight) {
  if (!img.naturalWidth || !img.naturalHeight) return;

  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = canvasWidth / canvasHeight;

  let drawWidth, drawHeight, offsetX, offsetY;

  if (imgRatio > canvasRatio) {
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / imgRatio;
    offsetX = 0;
    offsetY = (canvasHeight - drawHeight) / 2;
  } else {
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

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (overlay.style.display !== "none" && overlay.src && overlay.complete && overlay.naturalWidth > 0) {
    ctx.globalAlpha = currentOpacity;
    try {
      drawImageContain(ctx, overlay, canvas.width, canvas.height);
    } catch (e) {
      console.warn("合成失敗", e);
    }
    ctx.globalAlpha = 1;
  }

  canvas.style.display = "block";
  video.style.display = "none";
  overlay.style.display = "none";

  const a = document.createElement("a");
  a.download = "photo_" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".png";
  a.href = canvas.toDataURL("image/png");
  a.click();

  setTimeout(function() {
    canvas.style.display = "none";
    video.style.display = "block";

    const index = parseInt(overlaySelect.value);
    if (!isNaN(index) && overlays[index] && overlays[index].src) {
      overlay.style.display = "block";
    }
  }, 1000);
}

window.addEventListener("orientationchange", function() {
  setTimeout(function() {
    window.scrollTo(0, 0);
  }, 100);
});

window.onload = function() {
  startCamera();
  initDropbox();
};

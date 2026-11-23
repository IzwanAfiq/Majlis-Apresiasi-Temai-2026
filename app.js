/* Photobooth SK Temai 2026 — no login, no build step. */
(() => {
  "use strict";

  const CFG = Object.assign(
    { UPLOAD_URL: "", FILE_PREFIX: "SKTemai2026", JPEG_QUALITY: 0.92, COUNTDOWN: 3 },
    window.APP_CONFIG || {}
  );

  const FRAMES = {
    // win = the see-through window of the frame (in frame pixels, with a small
    // margin hidden under the border). The photo is fitted into this window
    // only, so nothing is wasted behind the border.
    portrait: { src: "assets/frame-portrait.png", label: "Potret", size: [960, 1637], win: [47, 574, 936, 1408] },
    landscape: { src: "assets/frame-landscape.png", label: "Landskap", size: [1672, 941], win: [85, 168, 1584, 869] },
  };
  const OUTPUT_LONG_SIDE = 1920;

  const $ = (id) => document.getElementById(id);
  const els = {
    screens: document.querySelectorAll(".screen"),
    video: $("video"), videoBg: $("videoBg"), win: $("win"), zoom: $("zoom"), overlay: $("overlay"), stage: $("stage"),
    iosSaveHint: $("iosSaveHint"),
    countdown: $("countdown"), flash: $("flash"), camError: $("camError"),
    shutter: $("shutterBtn"), flip: $("flipBtn"), fileInput: $("fileInput"),
    back: $("backBtn"), switchFrame: $("switchFrameBtn"), camTitle: $("camTitle"),
    resultImg: $("resultImg"), status: $("uploadStatus"),
    download: $("downloadBtn"), share: $("shareBtn"),
    retake: $("retakeBtn"), retakeTop: $("retakeTop"),
    canvas: $("canvas"), installBtn: $("installBtn"), iosHint: $("iosHint"), queueInfo: $("queueInfo"),
  };

  const state = {
    frame: "portrait",
    facing: "user",
    stream: null,
    busy: false,
    lastBlob: null,
    lastUrl: null,
    lastName: "",
    frameImgs: {},
    theme: "purple",
    zoom: 1, // 0 = show the whole camera picture, 1 = fill the window (default)
  };

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // Where the photo goes inside a box: zoom 0 = whole picture fits, 1 = fills box.
  function placeIn(bw, bh, srcW, srcH, zoom) {
    const fit = Math.min(bw / srcW, bh / srcH), fill = Math.max(bw / srcW, bh / srcH);
    const s = fit + (fill - fit) * zoom;
    const dw = srcW * s, dh = srcH * s;
    return { x: (bw - dw) / 2, y: (bh - dh) / 2, w: dw, h: dh };
  }

  // ---------- Frames preload ----------
  // Colour themes: each has its own pair of frames (same shape, so same window).
  const THEMES = {
    blue: { suffix: "", fill: "#0b2a94", color: "#0b2a94" },
    purple: { suffix: "-purple", fill: "#5a1fa8", color: "#5a1fa8" },
  };
  const frameSrc = (orient, theme = state.theme) => `assets/frame-${orient}${THEMES[theme].suffix}.png`;
  for (const theme of Object.keys(THEMES)) {
    for (const orient of Object.keys(FRAMES)) {
      const img = new Image();
      img.src = frameSrc(orient, theme);
      state.frameImgs[theme + "-" + orient] = img;
    }
  }
  const frameReady = (orient) => {
    const img = state.frameImgs[state.theme + "-" + orient];
    return img.complete && img.naturalWidth
      ? Promise.resolve(img)
      : new Promise((res, rej) => { img.onload = () => res(img); img.onerror = rej; });
  };

  // ---------- Screens ----------
  function show(id) {
    els.screens.forEach((s) => s.classList.toggle("active", s.id === id));
    if (id === "camera") requestAnimationFrame(fitStage);
  }

  // ---------- Stage sizing ----------
  async function fitStage() {
    const img = await frameReady(state.frame);
    const wrap = els.stage.parentElement;
    const cs = getComputedStyle(wrap);
    const availW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const ratio = img.naturalWidth / img.naturalHeight;
    let w = availW, h = w / ratio;
    if (h > availH) { h = availH; w = h * ratio; }
    els.stage.style.width = Math.floor(w) + "px";
    els.stage.style.height = Math.floor(h) + "px";
    placeVideo();
  }

  // Put the live video exactly where the photo will go in the final picture.
  function placeVideo() {
    const f = FRAMES[state.frame];
    const [fw, fh] = f.size, [x1, y1, x2, y2] = f.win;
    const w = els.win.style;
    w.left = (x1 / fw * 100) + "%";
    w.top = (y1 / fh * 100) + "%";
    w.width = ((x2 - x1) / fw * 100) + "%";
    w.height = ((y2 - y1) / fh * 100) + "%";
    layoutVideo();
  }

  function layoutVideo() {
    const v = els.video;
    if (!v.videoWidth) return;
    const r = placeIn(els.win.clientWidth, els.win.clientHeight, v.videoWidth, v.videoHeight, state.zoom);
    Object.assign(v.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
  }
  window.addEventListener("resize", () => { if ($("camera").classList.contains("active")) fitStage(); });

  // ---------- Camera ----------
  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    els.video.srcObject = null;
    els.videoBg.srcObject = null;
  }

  async function startCamera() {
    stopCamera();
    els.camError.classList.add("hidden");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      els.camError.classList.remove("hidden");
      return;
    }
    // Ask for the camera's natural 4:3 picture. Asking for a tall/forced shape
    // makes many phones crop the sensor, which looks zoomed in.
    const tries = [
      { video: { facingMode: { ideal: state.facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false },
      { video: { facingMode: state.facing }, audio: false },
      { video: true, audio: false },
    ];
    for (const c of tries) {
      try {
        state.stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (e) { state.stream = null; }
    }
    if (!state.stream) { els.camError.classList.remove("hidden"); return; }
    els.video.srcObject = state.stream;
    els.videoBg.srcObject = state.stream;
    const settings = state.stream.getVideoTracks()[0].getSettings ? state.stream.getVideoTracks()[0].getSettings() : {};
    const isFront = settings.facingMode ? settings.facingMode === "user" : state.facing === "user";
    els.video.classList.toggle("mirror", isFront);
    els.videoBg.classList.toggle("mirror", isFront);
    try { await els.video.play(); els.videoBg.play().catch(() => {}); } catch (e) { /* autoplay handled by attributes */ }
    layoutVideo();
  }

  async function openCamera(frame) {
    state.frame = frame;
    els.overlay.src = frameSrc(frame);
    els.camTitle.textContent = "Bingkai " + FRAMES[frame].label;
    show("camera");
    await startCamera();
  }

  // ---------- Compose ----------
  async function compose(source, srcW, srcH, mirror) {
    const frame = await frameReady(state.frame);
    const scale = OUTPUT_LONG_SIDE / Math.max(frame.naturalWidth, frame.naturalHeight);
    const W = Math.round(frame.naturalWidth * scale);
    const H = Math.round(frame.naturalHeight * scale);
    const c = els.canvas;
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = THEMES[state.theme].fill;
    ctx.fillRect(0, 0, W, H);

    // Fit the photo into the frame's window only (same as the live preview)
    const [fx1, fy1, fx2, fy2] = FRAMES[state.frame].win;
    const k = W / FRAMES[state.frame].size[0];
    const bx = fx1 * k, by = fy1 * k, bw = (fx2 - fx1) * k, bh = (fy2 - fy1) * k;
    const r = placeIn(bw, bh, srcW, srcH, state.zoom);
    const dx = bx + r.x, dy = by + r.y, dw = r.w, dh = r.h;
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    const X = (x, w) => (mirror ? W - x - w : x);
    // blurred fill for any empty space (shrink then enlarge = blur, works on every browser)
    if (dw < bw - 1 || dh < bh - 1) {
      const c = placeIn(bw, bh, srcW, srcH, 1);
      const tiny = document.createElement("canvas");
      tiny.width = 48; tiny.height = Math.max(1, Math.round(48 * srcH / srcW));
      tiny.getContext("2d").drawImage(source, 0, 0, tiny.width, tiny.height);
      ctx.filter = "brightness(0.75)";
      ctx.drawImage(tiny, X(bx + c.x, c.w), by + c.y, c.w, c.h);
      ctx.filter = "none";
    }
    ctx.drawImage(source, X(dx, dw), dy, dw, dh);
    ctx.restore();

    ctx.drawImage(frame, 0, 0, W, H);
    return new Promise((res) => c.toBlob(res, "image/jpeg", CFG.JPEG_QUALITY));
  }

  function fileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const rand = Math.random().toString(36).slice(2, 6);
    return `${CFG.FILE_PREFIX}_${state.theme}_${state.frame}_${stamp}_${rand}.jpg`;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function capture() {
    if (state.busy || !state.stream) return;
    state.busy = true;
    els.shutter.disabled = true;
    try {
      for (let i = CFG.COUNTDOWN; i > 0; i--) {
        els.countdown.textContent = i;
        els.countdown.classList.remove("hidden");
        // restart animation
        els.countdown.style.animation = "none"; void els.countdown.offsetWidth; els.countdown.style.animation = "";
        await sleep(1000);
      }
      els.countdown.classList.add("hidden");
      els.flash.classList.remove("go"); void els.flash.offsetWidth; els.flash.classList.add("go");
      const v = els.video;
      const blob = await compose(v, v.videoWidth, v.videoHeight, v.classList.contains("mirror"));
      await showResult(blob);
    } finally {
      els.countdown.classList.add("hidden");
      els.shutter.disabled = false;
      state.busy = false;
    }
  }

  async function fromFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const blob = await compose(img, img.naturalWidth, img.naturalHeight, false);
      await showResult(blob);
    } catch (e) {
      alert("Gambar tidak dapat dibuka. Sila cuba gambar lain.");
    } finally {
      URL.revokeObjectURL(url);
      els.fileInput.value = "";
    }
  }

  // ---------- Result ----------
  async function showResult(blob) {
    stopCamera();
    if (state.lastUrl) URL.revokeObjectURL(state.lastUrl);
    state.lastBlob = blob;
    state.lastName = fileName();
    state.lastUrl = URL.createObjectURL(blob);
    els.resultImg.src = state.lastUrl;

    const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([blob], state.lastName, { type: "image/jpeg" })] }));
    state.canShare = canShare;
    els.share.classList.toggle("hidden", !canShare);
    if (isIOS && canShare) {
      els.download.textContent = "📥 Simpan ke Foto";
      els.share.classList.add("hidden"); // same action, avoid two buttons
    }
    els.iosSaveHint.classList.toggle("hidden", !isIOS);
    show("result");
    queueUpload(blob, state.lastName);
  }

  function download() {
    if (!state.lastUrl) return;
    // iPhone/iPad: a download goes to the Files app. The share sheet's
    // "Save Image" is the only way to put it in the Photos album.
    if (isIOS && state.canShare) return share();
    const a = document.createElement("a");
    a.href = state.lastUrl;
    a.download = state.lastName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function share() {
    if (!state.lastBlob) return;
    const file = new File([state.lastBlob], state.lastName, { type: "image/jpeg" });
    try {
      await navigator.share({ files: [file], title: "SK Temai 2026", text: "Majlis Apresiasi Pendidikan dan Graduasi SK Temai 2026" });
    } catch (e) { /* user cancelled */ }
  }

  function retake() { openCamera(state.frame); }

  // ---------- Upload queue (IndexedDB, survives offline / app close) ----------
  const DB_NAME = "photobooth", STORE = "queue";
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "name" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  const qAdd = (item) => idb("readwrite", (s) => s.put(item));
  const qDel = (name) => idb("readwrite", (s) => s.delete(name));
  const qAll = () => idb("readonly", (s) => s.getAll());

  function setStatus(text, cls) {
    els.status.textContent = text;
    els.status.className = "status" + (cls ? " " + cls : "");
  }

  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function uploadOne(item) {
    const body = JSON.stringify({ filename: item.name, mimeType: "image/jpeg", data: await blobToBase64(item.blob) });
    let r;
    try {
      // text/plain avoids a CORS preflight, which Apps Script does not answer
      r = await fetch(CFG.UPLOAD_URL, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow" });
    } catch (e) {
      if (!navigator.onLine) throw e;
      // Some browsers block reading the redirected reply; send opaquely and trust it.
      await fetch(CFG.UPLOAD_URL, { method: "POST", body, mode: "no-cors" });
      return true;
    }
    const j = await r.json().catch(() => ({ ok: r.ok }));
    if (!j.ok) throw new Error(j.error || "upload failed");
    return true;
  }

  async function queueUpload(blob, name) {
    if (!CFG.UPLOAD_URL) {
      setStatus("⚠️ Simpanan Google Drive belum ditetapkan (config.js). Sila muat turun gambar.", "warn");
      return;
    }
    try { await qAdd({ name, blob, t: Date.now() }); } catch (e) { /* private mode: still try direct */ }
    if (!navigator.onLine) {
      setStatus("📴 Tiada internet. Gambar akan dihantar ke Google Drive bila talian pulih.", "warn");
      updateQueueInfo();
      return;
    }
    setStatus("☁️ Menyimpan ke Google Drive…");
    try {
      await uploadOne({ name, blob });
      await qDel(name).catch(() => {});
      if (state.lastName === name) setStatus("✅ Gambar telah disimpan ke Google Drive.", "ok");
    } catch (e) {
      if (state.lastName === name) setStatus("⏳ Gagal dihantar. Akan dicuba semula secara automatik.", "warn");
    }
    updateQueueInfo();
  }

  let flushing = false;
  async function flushQueue() {
    if (flushing || !CFG.UPLOAD_URL || !navigator.onLine) return;
    flushing = true;
    try {
      const items = (await qAll()) || [];
      for (const it of items) {
        try {
          await uploadOne(it);
          await qDel(it.name);
          if (state.lastName === it.name) setStatus("✅ Gambar telah disimpan ke Google Drive.", "ok");
        } catch (e) { break; }
      }
    } catch (e) { /* ignore */ }
    flushing = false;
    updateQueueInfo();
  }

  async function updateQueueInfo() {
    try {
      const n = ((await qAll()) || []).length;
      els.queueInfo.textContent = n ? `⏳ ${n} gambar menunggu untuk dihantar ke Google Drive.` : "";
      els.queueInfo.classList.toggle("hidden", !n);
    } catch (e) { /* ignore */ }
  }

  window.addEventListener("online", flushQueue);
  setInterval(flushQueue, 60000);

  // ---------- Install (PWA) ----------
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    els.installBtn.classList.remove("hidden");
  });
  els.installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    els.installBtn.classList.add("hidden");
  });
  window.addEventListener("appinstalled", () => els.installBtn.classList.add("hidden"));

  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isIOS && !standalone) els.iosHint.classList.remove("hidden");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // ---------- Events ----------
  document.querySelectorAll(".pick").forEach((b) => b.addEventListener("click", () => openCamera(b.dataset.frame)));
  els.shutter.addEventListener("click", capture);
  els.flip.addEventListener("click", () => { state.facing = state.facing === "user" ? "environment" : "user"; startCamera(); });
  els.switchFrame.addEventListener("click", () => {
    state.frame = state.frame === "portrait" ? "landscape" : "portrait";
    els.overlay.src = frameSrc(state.frame);
    els.camTitle.textContent = "Bingkai " + FRAMES[state.frame].label;
    fitStage();
    startCamera();
  });
  els.back.addEventListener("click", () => { stopCamera(); show("home"); updateQueueInfo(); });
  els.zoom.value = state.zoom * 100; // browsers may restore an old slider value
  els.zoom.addEventListener("input", () => { state.zoom = els.zoom.value / 100; layoutVideo(); });
  els.video.addEventListener("loadedmetadata", layoutVideo);
  els.video.addEventListener("resize", layoutVideo);
  els.fileInput.addEventListener("change", (e) => fromFile(e.target.files[0]));
  els.download.addEventListener("click", download);
  els.share.addEventListener("click", share);
  els.retake.addEventListener("click", retake);
  els.retakeTop.addEventListener("click", retake);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
    else if ($("camera").classList.contains("active")) startCamera();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.code === "Space" || e.code === "Enter") && $("camera").classList.contains("active")) { e.preventDefault(); capture(); }
  });

  // ---------- Colour theme picker ----------
  function setTheme(theme) {
    if (!THEMES[theme]) theme = "purple";
    state.theme = theme;
    document.body.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", THEMES[theme].color);
    document.querySelectorAll(".theme-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === theme)));
    document.querySelectorAll(".pick").forEach((b) => { b.querySelector("img").src = frameSrc(b.dataset.frame); });
    $("homeBanner").src = frameSrc("landscape");
    try { localStorage.setItem("theme", theme); } catch (e) { /* private mode */ }
  }
  document.querySelectorAll(".theme-btn").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme)));
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("theme"); } catch (e) { /* ignore */ }
  setTheme(savedTheme || "purple");

  updateQueueInfo();
  flushQueue();
})();

# Photobooth Majlis Apresiasi Pendidikan & Graduasi SK Temai 2026

A photobooth web app that guests open in a browser. It works on iPhone/iPad, Android and Windows, and they can install it like a normal app (PWA). Guests don't need to log in.

- Two frames: **Potret** (portrait) and **Landskap** (landscape)
- Live camera with the frame on top, a 3‑second countdown, and a switch between the front and back camera
- Guests can also pick a photo from their **Galeri** (gallery)
- **Muat Turun** (download) and **Kongsi** (share, on phones)
- Every photo goes to Google Drive automatically. If there's no internet, photos are saved on the device and sent when the connection comes back.
- Works offline after the first visit

---

## 1. Connect to Google Drive (one time only)

Guests don't log in, so a small Google Apps Script runs **as you** and saves the photos into your folder.

1. Sign in to the Google account that owns the folder
   `https://drive.google.com/drive/folders/1XkAz-m4rCei0NutFP58607RhtYvX_3mK`
2. Open <https://script.google.com> → **New project**.
3. Delete the default code and paste in the contents of [`google-apps-script/Code.gs`](google-apps-script/Code.gs). Click **Save**.
4. **Deploy → New deployment** → ⚙️ choose **Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
5. Click **Deploy** → **Authorize access** → choose your account → *Advanced* → *Go to project (unsafe)* → **Allow**.
6. Copy the **Web app URL** (it ends in `/exec`).
7. Open [`config.js`](config.js) and paste it in:
   ```js
   UPLOAD_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```
8. Commit/push the change.

> To check it: open the `/exec` URL in a browser. You should see `{"ok":true,...}`.
> If you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

## 2. Publish the app (GitHub Pages, free)

1. In this GitHub repository go to **Settings → Pages**.
2. *Source*: **Deploy from a branch** → choose your branch (e.g. `main`) and the **/ (root)** folder → **Save**.
3. After about a minute the link appears, e.g.
   `https://izwanafiq.github.io/Majlis-Apresiasi-Temai-2026/`
4. Share the link or a QR code with guests.

The camera only works over **HTTPS**. GitHub Pages already uses it.

## 3. Install the app on a device

| Device | How |
|---|---|
| **Android** (Chrome) | Open the link → **Pasang Aplikasi** button, or menu ⋮ → *Install app* |
| **iPhone / iPad** (Safari) | Open the link → **Share** button → *Add to Home Screen* |
| **Windows** (Edge/Chrome) | Open the link → **Pasang Aplikasi** button, or the ⊕ icon in the address bar |

---

## File structure

```
index.html              App pages
style.css               Look and feel
app.js                  Camera, frames, download, upload queue
config.js               ← settings (UPLOAD_URL, etc.)
sw.js                   Service worker (offline + installable)
manifest.webmanifest    App details for installing
assets/frame-*.png      Frames with a transparent centre
assets/icons/           App icons
google-apps-script/Code.gs   Receives photos → Google Drive
```

To change a frame, replace `assets/frame-portrait.png` or `assets/frame-landscape.png` with a PNG that has a transparent centre. Then bump `CACHE` in `sw.js` (e.g. `v2`) so devices pick up the new frame.

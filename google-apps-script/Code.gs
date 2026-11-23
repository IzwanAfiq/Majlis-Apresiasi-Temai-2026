/**
 * Penerima gambar Photobooth SK Temai 2026 → Google Drive.
 *
 * Pasang (sekali sahaja, guna akaun Google pemilik folder):
 *  1. Buka https://script.google.com → New project → tampal kod ini.
 *  2. Deploy → New deployment → Type: Web app
 *       Execute as:      Me
 *       Who has access:  Anyone
 *  3. Benarkan (Authorize) akses Drive, kemudian salin URL Web app (.../exec)
 *     ke dalam config.js → UPLOAD_URL.
 *
 * Tetamu tidak perlu log masuk: skrip ini berjalan sebagai anda dan
 * hanya boleh MENAMBAH fail .jpg ke dalam folder di bawah.
 */
const FOLDER_ID = "1XkAz-m4rCei0NutFP58607RhtYvX_3mK";
const MAX_BYTES = 15 * 1024 * 1024;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const bytes = Utilities.base64Decode(body.data || "");
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("Saiz fail tidak sah");
    // JPEG files start with FF D8
    if ((bytes[0] & 0xff) !== 0xff || (bytes[1] & 0xff) !== 0xd8) throw new Error("Bukan fail JPEG");

    const safeName = String(body.filename || "photo.jpg").replace(/[^\w.\-]/g, "_").slice(0, 120);
    const name = /\.jpe?g$/i.test(safeName) ? safeName : safeName + ".jpg";

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const file = folder.createFile(Utilities.newBlob(bytes, "image/jpeg", name));
    return json({ ok: true, id: file.getId(), name: name });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return json({ ok: true, message: "Photobooth SK Temai 2026 aktif" });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

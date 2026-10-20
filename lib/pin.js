export async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("monkas:" + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("monkas-admin:" + pw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem("monkas_session") || "null");
  } catch {
    return null;
  }
}

export function setSession(s) {
  localStorage.setItem("monkas_session", JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem("monkas_session");
}

export function getAdminSession() {
  try {
    return JSON.parse(localStorage.getItem("monkas_admin") || "null");
  } catch {
    return null;
  }
}

export function setAdminSession(s) {
  localStorage.setItem("monkas_admin", JSON.stringify(s));
}

// Policy password admin: boleh 6 angka, tapi kalau pakai huruf minimal 8 karakter.
// Dipakai juga untuk pesan error yang jelas di UI.
export function checkAdminPasswordPolicy(pw) {
  const v = String(pw || "");
  if (!v) return "Password wajib diisi.";
  if (/^\d+$/.test(v) && v.length < 6) return "PIN admin harus minimal 6 angka.";
  if (!/^\d+$/.test(v) && v.length < 8) return "Password admin minimal 8 karakter (atau 6 angka kalau pure PIN).";
  if (/^\d+$/.test(v)) return "PIN 6 angka dipakai: lanjut, tapi jangan dipakai buat data uang sungguhan sebelum rate limit aktif.";
  return null;
}

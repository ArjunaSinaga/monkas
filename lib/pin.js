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

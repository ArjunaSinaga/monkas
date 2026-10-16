"use client";

import { useState } from "react";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN harus 4-6 digit angka.");
      return;
    }
    setError("");
    alert("Login PIN " + pin + " — backend menyusul di Task 2.");
  }

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1>MONKAS</h1>
      <p>Monjali Kasir — masukkan PIN tenant di perangkat ini.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN 4-6 digit"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          style={{ width: "100%", padding: 12, fontSize: 18 }}
        />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" style={{ width: "100%", padding: 12, marginTop: 12 }}>
          Masuk
        </button>
      </form>
    </main>
  );
}

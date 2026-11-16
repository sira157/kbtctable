"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    const res = await fetch("/auth/login", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password, next }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      window.location.href = body.next ?? "/";
      return;
    }
    setErr(body.message ?? "เข้าสู่ระบบไม่สำเร็จ");
    setBusy(false);
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <div className="text-3xl">📅</div>
          <h1 className="mt-1 text-xl font-semibold">ระบบจัดตารางสอน</h1>
          <p className="text-sm text-slate-500">กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน</p>
        </div>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
          placeholder="รหัสผ่าน" className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy || !password} className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}

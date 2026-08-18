"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function Inner() {
  const rt = useSearchParams().get("rt");
  return (
    <main className="shell">
      <header className="top"><h1>CONNECTED</h1></header>
      <div className="card">
        <h3>YOU'RE SET FOR THIS BROWSER</h3>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#ccc" }}>
          Your dashboard is now pulling live data on this device. <a href="/" style={{ color: "#7BAAF7" }}>Open dashboard →</a>
        </p>
      </div>
      {rt && (
        <div className="card">
          <h3>OPTIONAL · FOR THE WIDGET + OTHER DEVICES</h3>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#8a8a8a" }}>
            To let the iOS widget (and any browser without this cookie) fetch data, add this
            refresh token as the <span className="mono">GOOGLE_REFRESH_TOKEN</span> environment
            variable in Vercel, then redeploy. It's shown once — treat it like a password.
          </p>
          <p className="mono" style={{ fontSize: 11, wordBreak: "break-all", marginTop: 10, padding: 10, border: "1px solid #1e2022", borderRadius: 8 }}>
            {rt}
          </p>
        </div>
      )}
    </main>
  );
}

export default function Connected() {
  return <Suspense><Inner /></Suspense>;
}

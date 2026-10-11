"use client";
import { useState } from "react";
import { request } from "./common";
export default function Login({
  setup,
  onDone,
}: {
  setup: boolean;
  onDone: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <div className="login-brand">P3H</div>
      <h1>{setup ? "Set up your local workspace" : "Welcome back"}</h1>
      <p>
        {setup
          ? "Create the first administrator account on this computer."
          : "Sign in to the internal case-management system."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const fd = new FormData(e.currentTarget);
          try {
            await request("/api/auth", {
              action: setup ? "setup" : "login",
              username: fd.get("username"),
              password: fd.get("password"),
              name: fd.get("name") ?? "",
            });
            await onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Sign-in failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {setup && (
          <label>
            Your name
            <input name="name" required autoComplete="name" />
          </label>
        )}
        <label>
          Username
          <input name="username" required autoComplete="username" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={setup ? 12 : undefined}
            required
            autoComplete={setup ? "new-password" : "current-password"}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy}>
          {busy ? "Please wait…" : setup ? "Create administrator" : "Sign in"}
        </button>
      </form>
      <p className="muted">Local storage · No cloud services</p>
    </main>
  );
}

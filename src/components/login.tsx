"use client";
import { useState } from "react";
import { request } from "./common";
export default function Login({
  setup,
  setupRequiresToken = false,
  hosted = false,
  onDone,
}: {
  setup: boolean;
  setupRequiresToken?: boolean;
  hosted?: boolean;
  onDone: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <div className="login-brand">P3H</div>
      <h1>{setup ? "Set up your workspace" : "Welcome back"}</h1>
      <p>
        {setup
          ? "Create the first administrator account."
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
              setupToken: fd.get("setupToken") ?? "",
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
        {setup && setupRequiresToken && (
          <label>
            Setup token
            <input
              name="setupToken"
              type="password"
              required
              autoComplete="off"
            />
          </label>
        )}
        <label>
          Username
          <input
            name="username"
            required
            autoComplete="username"
            aria-describedby={!setup ? "username-help" : undefined}
          />
        </label>
        {!setup && (
          <small id="username-help">
            Use your account username, which may differ from your display name.
          </small>
        )}
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={setup ? 12 : undefined}
            required
            autoComplete={setup ? "new-password" : "current-password"}
            aria-describedby={!setup ? "password-help" : undefined}
          />
        </label>
        {!setup && (
          <small id="password-help">
            Use your account password. The setup token is only for creating the
            first administrator.
          </small>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy}>
          {busy ? "Please wait…" : setup ? "Create administrator" : "Sign in"}
        </button>
      </form>
      <p className="muted">
        {hosted ? "Hosted staff workspace" : "Local staff workspace"}
      </p>
    </main>
  );
}

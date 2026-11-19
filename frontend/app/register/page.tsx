"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "../../lib/api";

type Mode = "create" | "join";

export default function RegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (mode === "create" && orgName.trim().length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }
    if (mode === "join" && inviteCode.trim().length < 4) {
      setError("Enter the invite code you received");
      return;
    }

    const body =
      mode === "create"
        ? { email, password, organization_name: orgName.trim() }
        : { email, password, invite_code: inviteCode.trim() };

    setLoading(true);
    try {
      await api("/register", { method: "POST", body: JSON.stringify(body) });
      const data = await api<{ access_token: string }>("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent)]";
  const labelClass =
    "mono mb-1.5 block text-[11px] uppercase tracking-widest text-[var(--text-secondary)]";
  const tabClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-2 text-xs transition-colors ${
      active
        ? "bg-[var(--surface-hover)] text-[var(--accent)]"
        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
          <span className="mono text-sm tracking-[0.3em]">TRINOVATECH</span>
        </div>

        <h1 className="mb-1 text-2xl font-semibold">Create account</h1>
        <p className="mb-6 text-sm text-[var(--text-secondary)]">
          Start a new organization, or join one you were invited to.
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <div className="flex gap-1 rounded-md border border-[var(--border)] bg-[var(--background)] p-1">
            <button type="button" onClick={() => setMode("create")} className={tabClass(mode === "create")}>
              New organization
            </button>
            <button type="button" onClick={() => setMode("join")} className={tabClass(mode === "join")}>
              Join with code
            </button>
          </div>

          <div>
            <label className={labelClass} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <p className="mono mt-1.5 text-[11px] text-[var(--text-secondary)]">
              Minimum 8 characters
            </p>
          </div>

          {mode === "create" ? (
            <div>
              <label className={labelClass} htmlFor="org">Organization name</label>
              <input
                id="org"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className={inputClass}
              />
              <p className="mono mt-1.5 text-[11px] text-[var(--text-secondary)]">
                You become its admin
              </p>
            </div>
          ) : (
            <div>
              <label className={labelClass} htmlFor="code">Invite code</label>
              <input
                id="code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className={`${inputClass} mono uppercase`}
              />
              <p className="mono mt-1.5 text-[11px] text-[var(--text-secondary)]">
                Ask an admin of your organization
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[var(--accent)] py-2.5 text-sm font-semibold text-[#0F1115] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
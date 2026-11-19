"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api, clearToken, getToken } from "../../lib/api";


type Me = {
  id: number;
  email: string;
  role: string;
  organization: string;
  invite_code?: string;
};

const NAV = [
  { href: "/dashboard", label: "Devices" },
  { href: "/dashboard/models", label: "Models" },
  { href: "/dashboard/preview", label: "Preview" },
  { href: "/dashboard/academy", label: "Academy" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/me")
      .then(setMe)
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router]);

  function logout() {
    clearToken();
    router.push("/login");
  }

  async function copyCode() {
    if (!me?.invite_code) return;
    try {
      await navigator.clipboard.writeText(me.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  if (!me) {
    return (
      <div className="mono flex min-h-screen items-center justify-center text-sm text-[var(--text-secondary)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-4 py-6">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
            <span className="mono text-xs tracking-[0.3em]">TRINOVATECH</span>
          </div>
          <p className="mono mt-3 truncate text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
            {me.organization}
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--surface-hover)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {me.invite_code && (
          <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
            <p className="mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
              Invite code
            </p>
            <button
              onClick={copyCode}
              title="Click to copy"
              className="mono mt-1 text-sm text-[var(--accent)] hover:underline"
            >
              {copied ? "copied!" : me.invite_code}
            </button>
          </div>
        )}

        <div className="border-t border-[var(--border)] pt-4">
          <p className="truncate px-2 text-xs">{me.email}</p>
          <p className="mono mt-0.5 px-2 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
            {me.role}
          </p>
          <button
            onClick={logout}
            className="mt-3 w-full rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}

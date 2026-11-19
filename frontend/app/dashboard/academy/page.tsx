"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import ModuleEditor, { AcademyModule } from "./ModuleEditor";

export default function AcademyPage() {
  const [modules, setModules] = useState<AcademyModule[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [role, setRole] = useState("");
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<AcademyModule | "new" | null>(null);
  const [loadError, setLoadError] = useState("");

  function loadModules() {
    api<AcademyModule[]>("/academy/modules")
      .then((data) => {
        setModules(data);
        setActiveKey((current) => current ?? data[0]?.module_key ?? null);
      })
      .catch(() => setLoadError("Could not load the Academy modules."));
  }

  useEffect(() => {
    loadModules();
    api<{ completed_modules: string[] }>("/academy/progress")
      .then((data) => setDone(data.completed_modules))
      .catch(() => {});
    api<{ role: string }>("/me")
      .then((me) => setRole(me.role))
      .catch(() => {});
  }, []);

  const canManage = role === "admin" || role === "formateur";

  async function toggleDone(key: string) {
    const wasDone = done.includes(key);
    const previous = done;
    setDone(wasDone ? done.filter((d) => d !== key) : [...done, key]);
    try {
      const data = await api<{ completed_modules: string[] }>(`/academy/progress/${key}`, {
        method: wasDone ? "DELETE" : "POST",
      });
      setDone(data.completed_modules);
    } catch {
      setDone(previous);
    }
  }

  async function saveModule(payload: {
    module_key: string;
    title: string;
    minutes: number;
    summary: string;
    sections: AcademyModule["sections"];
    takeaways: string[];
  }) {
    if (editing && editing !== "new") {
      await api(`/academy/modules/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/academy/modules", { method: "POST", body: JSON.stringify(payload) });
    }
    setEditing(null);
    loadModules();
  }

  async function deleteModule(m: AcademyModule) {
    if (!confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
    await api(`/academy/modules/${m.id}`, { method: "DELETE" });
    if (activeKey === m.module_key) setActiveKey(null);
    loadModules();
  }

  if (loadError) {
    return <p className="text-sm text-[var(--danger)]">{loadError}</p>;
  }
  if (modules.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">Loading...</p>;
  }

  if (editing) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Academy</h1>
        <ModuleEditor
          initial={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={saveModule}
        />
      </div>
    );
  }

  const index = modules.findIndex((m) => m.module_key === activeKey);
  const active = modules[index] ?? modules[0];
  const isDone = done.includes(active.module_key);
  const nextModule = modules[index + 1];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Academy</h1>
          <p className="mono mt-1 text-xs text-[var(--text-secondary)]">
            {done.length} / {modules.length} modules completed
          </p>
          <div className="mt-3 h-1 w-64 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{ width: `${(done.length / modules.length) * 100}%` }}
            />
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setManaging((v) => !v)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
          >
            {managing ? "Done managing" : "Manage courses"}
          </button>
        )}
      </div>

      {managing && (
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="mono mb-3 text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">
            Course management
          </p>
          <ul className="flex flex-col gap-2">
            {modules.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2"
              >
                <span className="text-sm">{m.title}</span>
                <span className="flex gap-3 text-xs">
                  <button onClick={() => setEditing(m)} className="text-[var(--accent)] hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => deleteModule(m)}
                    className="text-[var(--danger)] hover:underline"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setEditing("new")}
            className="mt-3 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[#0F1115] transition-opacity hover:opacity-90"
          >
            + Add module
          </button>
        </div>
      )}

      <div className="grid grid-cols-[280px_1fr] gap-6">
        <nav className="flex flex-col gap-2">
          {modules.map((m, i) => {
            const selected = m.module_key === active.module_key;
            const finished = done.includes(m.module_key);
            return (
              <button
                key={m.id}
                onClick={() => setActiveKey(m.module_key)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--surface-hover)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                <div className="mono flex items-center justify-between text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
                  <span>Module {i + 1}</span>
                  <span className={finished ? "text-[var(--accent)]" : ""}>
                    {finished ? "Done" : `${m.minutes} min`}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium">{m.title}</div>
              </button>
            );
          })}
        </nav>

        <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8">
          <p className="mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">
            Module {index + 1} · {active.minutes} min
          </p>
          <h2 className="mt-2 text-xl font-semibold">{active.title}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{active.summary}</p>

          {active.sections.map((s) => (
            <section key={s.heading} className="mt-7">
              <h3 className="text-sm font-semibold text-[var(--accent)]">{s.heading}</h3>
              {s.paragraphs.map((p) => (
                <p key={p} className="mt-2 text-sm leading-relaxed">
                  {p}
                </p>
              ))}
              {s.code && (
                <pre className="mono mt-3 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-4 text-xs text-[var(--text-secondary)]">
                  {s.code}
                </pre>
              )}
            </section>
          ))}

          <div className="mt-8 rounded-md border border-[var(--border)] bg-[var(--background)] p-5">
            <p className="mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">
              Key takeaways
            </p>
            <ul className="mt-3 space-y-2">
              {active.takeaways.map((t) => (
                <li key={t} className="flex gap-2 text-sm">
                  <span className="text-[var(--accent)]">→</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <button
              onClick={() => toggleDone(active.module_key)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 ${
                isDone
                  ? "border border-[var(--border)] text-[var(--text-secondary)]"
                  : "bg-[var(--accent)] text-[#0F1115]"
              }`}
            >
              {isDone ? "Mark as not done" : "Mark as complete"}
            </button>
            {nextModule && (
              <button
                onClick={() => setActiveKey(nextModule.module_key)}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-hover)]"
              >
                Next: {nextModule.title}
              </button>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

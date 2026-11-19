"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getToken } from "../../../lib/api";

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://127.0.0.1:4040";

type AIModel = {
  id: number;
  name: string;
  sha256_hash: string;
  file_size: number;
  uploaded_at: string;
};

type AgentStatus = {
  state: string;
  message: string;
  progress: number;
  model_id: number | null;
  sha256: string | null;
  simulated: boolean;
  device: string;
};

async function agentCall<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${AGENT_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    let message = "Edge Agent error";
    try {
      const d = await res.json();
      if (typeof d.detail === "string") message = d.detail;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleString();
}

function stateStyle(state: string) {
  switch (state) {
    case "success":
      return { color: "var(--accent)", label: "SUCCESS" };
    case "transferring":
      return { color: "var(--text-secondary)", label: "TRANSFERRING" };
    case "device_missing":
      return { color: "var(--warning)", label: "DEVICE MISSING" };
    case "wrong_device":
      return { color: "var(--warning)", label: "WRONG DEVICE" };
    case "error":
      return { color: "var(--danger)", label: "ERROR" };
    default:
      return { color: "var(--text-secondary)", label: "IDLE" };
  }
}

function deviceLabel(device: string) {
  if (device === "grove") return "Grove Vision AI V2 connected";
  if (device === "wrong") return "Unknown device connected";
  return "No device connected";
}

export default function ModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [role, setRole] = useState("");
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setModels(await api<AIModel[]>("/models"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load models");
    }
  }, []);

  const refreshAgent = useCallback(async () => {
    try {
      const s = await agentCall<AgentStatus>("/status");
      setAgent(s);
      setAgentOnline(true);
    } catch {
      setAgent(null);
      setAgentOnline(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState only happens after the awaited request resolves, not synchronously
    load();
    api<{ role: string }>("/me")
      .then((me) => setRole(me.role))
      .catch(() => {});
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState only happens after the awaited request resolves, not synchronously
    refreshAgent();
    const poll = setInterval(refreshAgent, 700);
    return () => clearInterval(poll);
  }, [refreshAgent]);

  const canUpload = role === "admin" || role === "formateur";
  const transferring = agent?.state === "transferring";

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api("/models/upload", { method: "POST", body: form });
      setSuccess(`"${file.name}" uploaded and validated.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDeploy(m: AIModel) {
    setError("");
    setSuccess("");
    const token = getToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    try {
      await agentCall("/deploy", {
        method: "POST",
        body: JSON.stringify({ model_id: m.id, token }),
      });
      await refreshAgent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
    }
  }

  async function simulate(device: "grove" | "wrong" | "missing") {
    try {
      await agentCall("/simulate", {
        method: "POST",
        body: JSON.stringify({ device }),
      });
      await refreshAgent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the simulated device");
    }
  }

  async function dismiss() {
    try {
      await agentCall("/reset", { method: "POST" });
      await refreshAgent();
    } catch {}
  }

  async function copyHash(m: AIModel) {
    try {
      await navigator.clipboard.writeText(m.sha256_hash);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  }

  const shown = models.filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase())
  );

  const headClass =
    "mono px-4 py-3 text-left text-[11px] font-normal uppercase tracking-widest text-[var(--text-secondary)]";
  const smallBtn =
    "mono rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]";

  const style = agent ? stateStyle(agent.state) : stateStyle("idle");

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Model Hub</h1>
          <p className="mono mt-1 text-xs text-[var(--text-secondary)]">
            {models.length} model{models.length === 1 ? "" : "s"} available
          </p>
        </div>

        <div className="flex gap-2">
          <input
            placeholder="Search models..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-52 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)]"
          />
          {canUpload && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0F1115] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload .zip"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: agentOnline ? "var(--accent)" : "var(--danger)" }}
          />
          <span className="mono text-[11px] uppercase tracking-widest">Edge Agent</span>
          {agentOnline && agent ? (
            <>
              <span className="text-xs text-[var(--text-secondary)]">
                {deviceLabel(agent.device)}
              </span>
              {agent.simulated && (
                <span className="mono rounded border border-[var(--warning)]/50 px-1.5 py-0.5 text-[10px] uppercase text-[var(--warning)]">
                  simulated
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-[var(--danger)]">
              Not running. Start it on port 4040 to deploy models.
            </span>
          )}
        </div>

        {agentOnline && agent?.simulated && (
          <div className="flex gap-2">
            <button onClick={() => simulate("grove")} disabled={transferring} className={smallBtn}>
              Plug in
            </button>
            <button onClick={() => simulate("wrong")} disabled={transferring} className={smallBtn}>
              Wrong device
            </button>
            <button onClick={() => simulate("missing")} className={smallBtn}>
              Unplug
            </button>
          </div>
        )}
      </div>

      {agent && agent.state !== "idle" && (
        <div
          className="mb-4 rounded-lg border bg-[var(--surface)] p-4"
          style={{ borderColor: style.color }}
        >
          <div className="flex items-center justify-between">
            <span className="mono text-xs tracking-widest" style={{ color: style.color }}>
              {style.label}
            </span>
            {!transferring && (
              <button onClick={dismiss} className={smallBtn}>
                Dismiss
              </button>
            )}
          </div>
          <p className="mt-2 text-sm">{agent.message}</p>
          {(agent.state === "transferring" || agent.state === "success") && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full transition-all"
                style={{ width: `${agent.progress}%`, background: style.color }}
              />
            </div>
          )}
          {agent.state === "success" && agent.sha256 && (
            <p className="mono mt-3 text-[11px] text-[var(--text-secondary)]">
              Verified SHA256: {agent.sha256.slice(0, 12)}…{agent.sha256.slice(-6)}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-4 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-sm text-[var(--accent)]">
          {success}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)]">
            <tr>
              <th className={headClass}>Name</th>
              <th className={headClass}>SHA256</th>
              <th className={headClass}>Size</th>
              <th className={headClass}>Uploaded</th>
              <th className={headClass}>Deploy</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-[var(--text-secondary)]"
                >
                  {models.length === 0
                    ? "No models yet. Upload a .zip containing a manifest.json."
                    : "No model matches your search."}
                </td>
              </tr>
            )}
            {shown.map((m) => (
              <tr
                key={m.id}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]"
              >
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => copyHash(m)}
                    title="Click to copy the full hash"
                    className="mono text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
                  >
                    {copiedId === m.id
                      ? "copied!"
                      : `${m.sha256_hash.slice(0, 12)}…${m.sha256_hash.slice(-6)}`}
                  </button>
                </td>
                <td className="mono px-4 py-3 text-xs">{formatSize(m.file_size)}</td>
                <td className="mono px-4 py-3 text-xs text-[var(--text-secondary)]">
                  {formatDate(m.uploaded_at)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleDeploy(m)}
                    disabled={!agentOnline || transferring}
                    title={
                      agentOnline
                        ? "Send this model to the connected device"
                        : "Start the Edge Agent first"
                    }
                    className="rounded-md border border-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[#0F1115] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--accent)]"
                  >
                    Deploy
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
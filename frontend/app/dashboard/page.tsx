"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";

type Device = {
  id: number;
  device_id: string;
  name: string | null;
  status: string;
  battery: number | null;
  rssi: number | null;
  temperature: number | null;
  last_seen: string | null;
};

const ONLINE_WINDOW_MS = 15000;

function seenAt(d: Device): number | null {
  if (!d.last_seen) return null;
  const iso = d.last_seen.endsWith("Z") ? d.last_seen : d.last_seen + "Z";
  return new Date(iso).getTime();
}

function ago(ms: number | null, now: number): string {
  if (ms === null) return "never";
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setDevices(await api<Device[]>("/devices"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load devices");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState only happens after the awaited request resolves, not synchronously
    load();
    const poll = setInterval(load, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  async function addDevice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    try {
      await api("/devices", {
        method: "POST",
        body: JSON.stringify({ device_id: newId, name: newName || null }),
      });
      setNewId("");
      setNewName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add device");
    } finally {
      setAdding(false);
    }
  }

  const rows = devices.map((d) => {
    const seen = seenAt(d);
    const online = seen !== null && now - seen < ONLINE_WINDOW_MS;
    return { d, seen, online };
  });
  const onlineCount = rows.filter((r) => r.online).length;

  const inputClass =
    "rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--accent)]";
  const headClass =
    "mono px-4 py-3 text-left text-[11px] font-normal uppercase tracking-widest text-[var(--text-secondary)]";

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Devices</h1>
          <p className="mono mt-1 text-xs text-[var(--text-secondary)]">
            {onlineCount} online / {devices.length} registered
          </p>
        </div>

        <form onSubmit={addDevice} className="flex gap-2">
          <input
            required
            placeholder="Device ID"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            className={`${inputClass} mono w-44`}
          />
          <input
            placeholder="Name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={`${inputClass} w-44`}
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0F1115] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        </form>
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)]">
            <tr>
              <th className={headClass}>Status</th>
              <th className={headClass}>Device</th>
              <th className={headClass}>Battery</th>
              <th className={headClass}>Signal</th>
              <th className={headClass}>Temp</th>
              <th className={headClass}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[var(--text-secondary)]"
                >
                  No devices yet. Add one above.
                </td>
              </tr>
            )}
            {rows.map(({ d, seen, online }) => (
              <tr
                key={d.id}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]"
              >
                <td className="px-4 py-3">
                  <span className="mono inline-flex items-center gap-2 text-xs">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        online ? "bg-[var(--accent)]" : "bg-[var(--text-secondary)]"
                      }`}
                    />
                    <span
                      className={
                        online ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
                      }
                    >
                      {online ? "ONLINE" : "OFFLINE"}
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div>{d.name ?? "Unnamed"}</div>
                  <div className="mono text-xs text-[var(--text-secondary)]">
                    {d.device_id}
                  </div>
                </td>
                <td className="mono px-4 py-3">
                  {d.battery !== null ? `${d.battery}%` : "—"}
                </td>
                <td className="mono px-4 py-3">
                  {d.rssi !== null ? `${d.rssi} dBm` : "—"}
                </td>
                <td className="mono px-4 py-3">
                  {d.temperature !== null ? `${d.temperature}°C` : "—"}
                </td>
                <td className="mono px-4 py-3 text-xs text-[var(--text-secondary)]">
                  {ago(seen, now)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
"use client";

import { useEffect, useRef, useState } from "react";

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://127.0.0.1:4040";
const W = 960;
const H = 540;

type Det = { label: string; score: number; x: number; y: number; w: number; h: number };
type Resp = { active: boolean; objects: Det[] };
type Status = "offline" | "idle" | "live";

const COLORS: Record<string, string> = {
  person: "#4ADE80",
  cup: "#F59E0B",
  laptop: "#60A5FA",
};

export default function PreviewPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<Det[]>([]);
  const shownRef = useRef<Map<string, Det>>(new Map());
  const statusRef = useRef<Status>("offline");
  const thresholdRef = useRef(0.5);

  const [status, setStatus] = useState<Status>("offline");
  const [objects, setObjects] = useState<Det[]>([]);
  const [threshold, setThreshold] = useState(50);

  useEffect(() => {
    thresholdRef.current = threshold / 100;
  }, [threshold]);

  // Ask the Edge Agent (on this computer) for detections about 5 times a second.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${AGENT_URL}/detections`);
        if (!res.ok) throw new Error("bad response");
        const data: Resp = await res.json();
        if (cancelled) return;
        targetRef.current = data.objects;
        const next: Status = data.active ? "live" : "idle";
        statusRef.current = next;
        setStatus(next);
        setObjects(data.objects);
      } catch {
        if (cancelled) return;
        targetRef.current = [];
        statusRef.current = "offline";
        setStatus("offline");
        setObjects([]);
      }
    }

    poll();
    const id = setInterval(poll, 200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Draw the simulated camera image and the boxes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    function draw(now: number) {
      const c = ctx as CanvasRenderingContext2D;
      const t = now / 1000;

      c.fillStyle = "#0B0D11";
      c.fillRect(0, 0, W, H);

      c.strokeStyle = "#1A1D23";
      c.lineWidth = 1;
      for (let x = 0; x <= W; x += 60) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, H);
        c.stroke();
      }
      for (let y = 0; y <= H; y += 60) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y);
        c.stroke();
      }

      const scanY = (t * 70) % (H + 40) - 40;
      c.fillStyle = "rgba(74, 222, 128, 0.05)";
      c.fillRect(0, scanY, W, 40);

      c.font = "12px ui-monospace, Consolas, monospace";
      c.textBaseline = "top";
      c.fillStyle = "#8B92A0";
      c.fillText("CAM 01  ·  SIMULATED FEED", 16, 14);

      if (statusRef.current !== "live") {
        c.textAlign = "center";
        c.fillStyle = "#8B92A0";
        c.font = "16px ui-monospace, Consolas, monospace";
        c.fillText(
          statusRef.current === "offline"
            ? "Edge Agent not running"
            : "No live feed. Deploy a model to a connected device first.",
          W / 2,
          H / 2 - 8
        );
        c.textAlign = "left";
        shownRef.current.clear();
        raf = requestAnimationFrame(draw);
        return;
      }

      // Move each box smoothly toward its newest position.
      const shown = shownRef.current;
      const labels = new Set(targetRef.current.map((o) => o.label));
      for (const key of Array.from(shown.keys())) {
        if (!labels.has(key)) shown.delete(key);
      }
      for (const target of targetRef.current) {
        const current = shown.get(target.label);
        if (!current) {
          shown.set(target.label, { ...target });
        } else {
          const k = 0.25;
          current.x += (target.x - current.x) * k;
          current.y += (target.y - current.y) * k;
          current.w += (target.w - current.w) * k;
          current.h += (target.h - current.h) * k;
          current.score += (target.score - current.score) * k;
        }
      }

      c.font = "13px ui-monospace, Consolas, monospace";
      shown.forEach((d) => {
        if (d.score < thresholdRef.current) return;
        const color = COLORS[d.label] ?? "#4ADE80";
        const bx = d.x * W;
        const by = d.y * H;
        const bw = d.w * W;
        const bh = d.h * H;

        c.strokeStyle = color;
        c.lineWidth = 2;
        c.strokeRect(bx, by, bw, bh);

        const text = `${d.label} ${Math.round(d.score * 100)}%`;
        const tw = c.measureText(text).width + 12;
        const ty = by > 24 ? by - 22 : by;
        c.fillStyle = color;
        c.fillRect(bx, ty, tw, 22);
        c.fillStyle = "#0F1115";
        c.fillText(text, bx + 6, ty + 5);
      });

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const visible = objects.filter((o) => o.score >= threshold / 100);

  const badge =
    status === "live"
      ? { text: "LIVE", color: "var(--accent)" }
      : status === "idle"
      ? { text: "WAITING", color: "var(--warning)" }
      : { text: "OFFLINE", color: "var(--danger)" };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Live Preview</h1>
          <p className="mono mt-1 text-xs text-[var(--text-secondary)]">
            Detections from the connected device
          </p>
        </div>
        <span
          className="mono rounded border px-2 py-1 text-[11px] tracking-widest"
          style={{ color: badge.color, borderColor: badge.color }}
        >
          {badge.text}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-6">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg border border-[var(--border)]"
        />

        <aside className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">
              Confidence threshold
            </p>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="mono w-10 text-right text-sm">{threshold}%</span>
            </div>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Detections below this score are hidden.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">
              Detections ({visible.length})
            </p>
            {visible.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">Nothing to show.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {visible.map((o) => (
                  <li key={o.label}>
                    <div className="flex justify-between text-sm">
                      <span>{o.label}</span>
                      <span className="mono">{Math.round(o.score * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className="h-full"
                        style={{
                          width: `${o.score * 100}%`,
                          background: COLORS[o.label] ?? "var(--accent)",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mono text-[11px] uppercase tracking-widest text-[var(--accent)]">
              Private by design
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              This preview runs on your computer only. The feed comes from the Edge Agent on
              localhost and is never uploaded.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
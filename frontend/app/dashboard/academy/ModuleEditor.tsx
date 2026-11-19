"use client";

import { useState } from "react";

export type Section = { heading: string; paragraphs: string[]; code?: string };
export type AcademyModule = {
  id: number;
  module_key: string;
  title: string;
  minutes: number;
  summary: string;
  sections: Section[];
  takeaways: string[];
  position: number;
};

type SectionDraft = { heading: string; paragraphsText: string; code: string };

function toDraftSections(sections: Section[]): SectionDraft[] {
  return sections.map((s) => ({
    heading: s.heading,
    paragraphsText: s.paragraphs.join("\n\n"),
    code: s.code ?? "",
  }));
}

export default function ModuleEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: AcademyModule | null;
  onCancel: () => void;
  onSave: (payload: {
    module_key: string;
    title: string;
    minutes: number;
    summary: string;
    sections: Section[];
    takeaways: string[];
  }) => Promise<void>;
}) {
  const [moduleKey, setModuleKey] = useState(initial?.module_key ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [minutes, setMinutes] = useState(initial?.minutes ?? 5);
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [sections, setSections] = useState<SectionDraft[]>(
    initial ? toDraftSections(initial.sections) : [{ heading: "", paragraphsText: "", code: "" }]
  );
  const [takeawaysText, setTakeawaysText] = useState(initial?.takeaways.join("\n") ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateSection(i: number, patch: Partial<SectionDraft>) {
    setSections(sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addSection() {
    setSections([...sections, { heading: "", paragraphsText: "", code: "" }]);
  }

  function removeSection(i: number) {
    setSections(sections.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setError("");
    if (!moduleKey.trim() || !title.trim() || !summary.trim()) {
      setError("Module key, title and summary are required.");
      return;
    }
    const cleanSections: Section[] = sections
      .filter((s) => s.heading.trim())
      .map((s) => ({
        heading: s.heading.trim(),
        paragraphs: s.paragraphsText
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean),
        code: s.code.trim() || undefined,
      }));
    const takeaways = takeawaysText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (cleanSections.length === 0 || takeaways.length === 0) {
      setError("Add at least one section (with a heading) and one takeaway.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        module_key: moduleKey.trim(),
        title: title.trim(),
        minutes,
        summary: summary.trim(),
        sections: cleanSections,
        takeaways,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the module");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
      <h3 className="text-sm font-semibold">{initial ? "Edit module" : "New module"}</h3>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          Module key (unique id, e.g. &quot;edge-ai&quot;)
          <input
            value={moduleKey}
            onChange={(e) => setModuleKey(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
          Minutes
          <input
            type="number"
            min={1}
            max={120}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
      </label>

      <label className="mt-4 flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
        Summary (one line, shown under the title)
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
      </label>

      <div className="mt-5">
        <p className="mono text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">
          Sections
        </p>
        {sections.map((s, i) => (
          <div key={i} className="mt-3 rounded-md border border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-2">
              <input
                placeholder="Section heading"
                value={s.heading}
                onChange={(e) => updateSection(i, { heading: e.target.value })}
                className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
              <button
                onClick={() => removeSection(i)}
                className="text-xs text-[var(--danger)] hover:underline"
              >
                Remove
              </button>
            </div>
            <textarea
              placeholder="Paragraphs (leave a blank line between paragraphs)"
              value={s.paragraphsText}
              onChange={(e) => updateSection(i, { paragraphsText: e.target.value })}
              rows={3}
              className="mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
            <textarea
              placeholder="Optional code block"
              value={s.code}
              onChange={(e) => updateSection(i, { code: e.target.value })}
              rows={2}
              className="mono mt-2 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--text-primary)]"
            />
          </div>
        ))}
        <button
          onClick={addSection}
          className="mt-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
        >
          + Add section
        </button>
      </div>

      <label className="mt-5 flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
        Key takeaways (one per line)
        <textarea
          value={takeawaysText}
          onChange={(e) => setTakeawaysText(e.target.value)}
          rows={3}
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
      </label>

      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0F1115] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save module"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-hover)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

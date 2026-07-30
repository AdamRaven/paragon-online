import type { ReactNode } from "react";

/** A single key/button, styled like the landing page's control reference. */
export function Keycap({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center h-8 px-2 border rounded-md keycap-inner font-keycap-label text-keycap-label ${
        wide
          ? "min-w-[3rem] bg-mana-glow/20 border-mana-glow/40 text-mana-glow"
          : "min-w-[2rem] bg-obsidian-grey border-outline/20 text-on-surface"
      }`}
    >
      {children}
    </span>
  );
}

export interface KeyRow {
  label: string;
  content: ReactNode;
}

/** A label/keycap(s) reference list, matching the landing page's "Command
 * Center" control grid — used by the Arena and Campaign pre-game screens. */
export function KeyList({ rows }: { rows: KeyRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-4 text-sm">
          <span className="text-on-surface-variant">{r.label}</span>
          <span className="flex items-center gap-1.5 flex-wrap justify-end text-on-surface-variant">
            {r.content}
          </span>
        </li>
      ))}
    </ul>
  );
}

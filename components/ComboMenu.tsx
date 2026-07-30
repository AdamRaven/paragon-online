"use client";

import { useState } from "react";
import { BASE_INPUTS, CLASS_COMBOS } from "@/lib/arena/comboData";
import { getClass } from "@/lib/arena/classes";
import type { ClassId } from "@/lib/arena/types";

export function ComboMenu({
  classId,
  onClose,
}: {
  classId: ClassId;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"base" | "class">("class");
  const cls = getClass(classId);
  const combos = CLASS_COMBOS[classId];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wide combo-menu" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>Combo Menu</h2>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {cls.name} · {cls.weapon}
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Close (Tab)
          </button>
        </div>

        <div className="tab-row">
          <button
            className={`btn ${tab === "base" ? "" : "btn-ghost"} tab`}
            onClick={() => setTab("base")}
          >
            Base Inputs
          </button>
          <button
            className={`btn ${tab === "class" ? "" : "btn-ghost"} tab`}
            onClick={() => setTab("class")}
          >
            {cls.name} Combos
          </button>
        </div>

        {tab === "base" && (
          <div className="combo-list">
            {BASE_INPUTS.map((b) => (
              <div className="combo-card" key={b.input}>
                <div className="combo-card-head">
                  <span className="combo-chip">{b.input}</span>
                  <strong className="combo-card-title">{b.meaning}</strong>
                </div>
                <p className="combo-card-desc">{b.description}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "class" && (
          <div className="combo-list">
            {combos.map((c) => (
              <div className="combo-card" key={c.input + c.name}>
                <div className="combo-card-head">
                  <strong className="combo-card-title">{c.name}</strong>
                  <span className="combo-card-badges">
                    {c.knockdown && <span className="badge combo-badge-kd">Knockdown</span>}
                    {c.stoic && <span className="badge combo-badge-stoic">Stoic</span>}
                  </span>
                </div>
                <span className="combo-chip combo-chip-wide">{c.input}</span>
                <p className="combo-card-desc">{c.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

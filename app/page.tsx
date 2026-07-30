import type { Metadata } from "next";
import Link from "next/link";
import "./landing.css";
import { ClassPortrait } from "@/components/ClassPortrait";
import { KACPER, PARAGON, SHEDIM } from "@/lib/arena/classes";

export const metadata: Metadata = {
  title: "PARAGON | Ethereal Combat",
  description:
    "Chain basic attacks into knockdowns, break combos with Manastop, dash through the arena and level up through three stages of enemies.",
};

/** Bar-fill percentages, on the same purely-decorative reference scale the
 * design mockup used (HP/10, Mana/5, AP as-is) — not tied to any real "max stat". */
function statPct(hp: number, mana: number, ap: number) {
  return {
    hp: Math.min(100, hp / 10),
    mana: Math.min(100, mana / 5),
    ap: Math.min(100, ap),
  };
}

const CLASS_SHOWCASE = [
  { cls: PARAGON, nameClass: "text-paragon-gold", ring: "hover:border-paragon-gold", featured: false },
  { cls: SHEDIM, nameClass: "text-on-surface", ring: "hover:border-ethereal-purple", featured: true },
  { cls: KACPER, nameClass: "text-primary", ring: "hover:border-mana-glow", featured: false },
] as const;

const MOVEMENT_KEYS = [
  { key: "W", label: "Move Up" },
  { key: "A", label: "Move Left" },
  { key: "S", label: "Move Down" },
  { key: "D", label: "Move Right" },
];

const COMBAT_KEYS = [
  { key: "LMB", label: "Basic Attack", wide: true },
  { key: "RMB", label: "Heavy/Special", wide: true },
  { key: "Q", label: "Ability 1", wide: false },
  { key: "E", label: "Ability 2", wide: false },
  { key: "R", label: "Ultimate", wide: false },
  { key: "F", label: "Interact", wide: false },
];

export default function Home() {
  return (
    <main className="landing-page font-body-md text-body-md">
      {/* Top nav */}
      <header className="fixed top-0 w-full z-50 bg-surface/60 backdrop-blur-xl border-b border-primary/20 h-20">
        <div className="flex justify-between items-center px-margin-mobile md:px-gutter max-w-container-max mx-auto h-full">
          <div className="font-display-hero text-headline-lg text-paragon-gold tracking-tighter">
            PARAGON
          </div>
          <nav className="hidden md:flex space-x-8">
            <a
              className="font-section-label text-section-label uppercase tracking-widest text-paragon-gold border-b-2 border-paragon-gold pb-1 hover:scale-105 transition-transform duration-200"
              href="#top"
            >
              Play
            </a>
            <a
              className="font-section-label text-section-label uppercase tracking-widest text-on-surface hover:text-mana-glow transition-colors hover:scale-105 transition-transform duration-200"
              href="#classes"
            >
              Classes
            </a>
            <a
              className="font-section-label text-section-label uppercase tracking-widest text-on-surface hover:text-mana-glow transition-colors hover:scale-105 transition-transform duration-200"
              href="#controls"
            >
              Controls
            </a>
          </nav>
          <button className="bg-primary text-on-primary px-6 py-2 font-section-label text-section-label uppercase tracking-widest hover:scale-105 transition-transform active:opacity-80 active:scale-95">
            Join Discord
          </button>
        </div>
      </header>

      <div id="top" />

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 px-margin-mobile text-center overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-mana-glow/5 rounded-full blur-[120px]" />
          <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] bg-ethereal-purple/5 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto space-y-stack-md">
          <h1 className="font-display-hero text-display-hero text-paragon-gold gold-glow-text tracking-tighter uppercase leading-none">
            PARAGON
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Chain basic attacks into knockdowns, break combos with Manastop, dash through the
            arena and level up through three stages of enemies.
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center pt-8">
            <Link
              href="/adventure"
              className="bg-paragon-gold text-void-black px-10 py-4 font-section-label text-section-label uppercase tracking-widest font-bold glow-border-gold transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(255,204,0,0.5)]"
            >
              START CAMPAIGN
            </Link>
            <Link
              href="/arena"
              className="border-2 border-mana-glow text-mana-glow px-10 py-4 font-section-label text-section-label uppercase tracking-widest font-bold transition-all hover:bg-mana-glow/10 hover:scale-105"
            >
              ENTER DUEL ARENA
            </Link>
          </div>
        </div>
        <div className="absolute bottom-10 animate-bounce">
          <svg
            className="w-6 h-6 text-mana-glow"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </section>

      {/* Class showcase */}
      <section
        id="classes"
        className="py-stack-lg px-margin-mobile md:px-gutter max-w-container-max mx-auto scroll-mt-20"
      >
        <div className="mb-12 text-center">
          <h2 className="font-section-label text-section-label uppercase tracking-[0.2em] text-mana-glow mb-2">
            Class Showcase
          </h2>
          <h3 className="font-headline-lg text-headline-lg md:text-headline-lg text-on-surface">
            Choose Your Path
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {CLASS_SHOWCASE.map(({ cls, nameClass, ring, featured }) => {
            const pct = statPct(cls.maxHp, cls.maxMana, cls.attackPower);
            return (
              <div
                key={cls.id}
                className={`glass-panel border border-primary/20 p-8 flex flex-col items-center group transition-colors ${ring}${
                  featured ? " scale-105 shadow-2xl" : ""
                }`}
              >
                <div className="portal-frame mb-6 bg-surface-container-high flex items-center justify-center overflow-hidden grayscale group-hover:grayscale-0 transition-all duration-500">
                  <ClassPortrait classId={cls.id} aura={cls.colors.aura} size={112} />
                </div>
                <h4 className={`font-headline-lg text-headline-lg ${nameClass} mb-1`}>{cls.name}</h4>
                <span className="font-section-label text-section-label text-outline mb-6">
                  {cls.weapon} • Reach {cls.rangeLevel}
                </span>
                <div className="w-full space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between font-section-label text-[10px] uppercase text-on-surface-variant">
                      <span>HP</span>
                      <span>{cls.maxHp}</span>
                    </div>
                    <div className="stat-bar-container">
                      <div className="stat-bar-hp h-full" style={{ width: `${pct.hp}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between font-section-label text-[10px] uppercase text-on-surface-variant">
                      <span>{cls.manaLabel}</span>
                      <span>{cls.maxMana}</span>
                    </div>
                    <div className="stat-bar-container">
                      <div className="stat-bar-mana h-full" style={{ width: `${pct.mana}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between font-section-label text-[10px] uppercase text-on-surface-variant">
                      <span>AP</span>
                      <span>{cls.attackPower}</span>
                    </div>
                    <div className="stat-bar-container">
                      <div className="stat-bar-ap h-full" style={{ width: `${pct.ap}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Controls */}
      <section id="controls" className="py-stack-lg bg-surface-container-lowest scroll-mt-20">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-gutter">
          <div className="mb-12">
            <h2 className="font-section-label text-section-label uppercase tracking-[0.2em] text-paragon-gold mb-2">
              Command Center
            </h2>
            <h3 className="font-headline-lg text-headline-lg text-on-surface">Control Reference</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
            {/* Movement */}
            <div className="space-y-stack-md">
              <h4 className="font-section-label text-section-label uppercase text-outline border-b border-outline-variant/30 pb-2">
                Movement
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {MOVEMENT_KEYS.map((k) => (
                  <div key={k.key} className="flex items-center space-x-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-obsidian-grey border border-outline/20 rounded-md keycap-inner font-keycap-label text-keycap-label text-on-surface">
                      {k.key}
                    </div>
                    <span className="font-body-md text-on-surface-variant">{k.label}</span>
                  </div>
                ))}
                <div className="flex items-center space-x-3 col-span-2">
                  <div className="w-24 h-10 flex items-center justify-center bg-obsidian-grey border border-outline/20 rounded-md keycap-inner font-keycap-label text-keycap-label text-on-surface">
                    SPACE
                  </div>
                  <span className="font-body-md text-on-surface-variant">Dash / Jump</span>
                </div>
              </div>
            </div>

            {/* Combat */}
            <div className="space-y-stack-md">
              <h4 className="font-section-label text-section-label uppercase text-outline border-b border-outline-variant/30 pb-2">
                Combat
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {COMBAT_KEYS.map((k) => (
                  <div key={k.key} className="flex items-center space-x-3">
                    <div
                      className={
                        k.wide
                          ? "w-12 h-10 flex items-center justify-center bg-mana-glow/20 border border-mana-glow/40 rounded-md keycap-inner font-keycap-label text-keycap-label text-mana-glow"
                          : "w-10 h-10 flex items-center justify-center bg-obsidian-grey border border-outline/20 rounded-md keycap-inner font-keycap-label text-keycap-label text-on-surface"
                      }
                    >
                      {k.key}
                    </div>
                    <span className="font-body-md text-on-surface-variant">{k.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* System */}
            <div className="space-y-stack-md">
              <h4 className="font-section-label text-section-label uppercase text-outline border-b border-outline-variant/30 pb-2">
                System
              </h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-16 h-10 flex items-center justify-center bg-obsidian-grey border border-outline/20 rounded-md keycap-inner font-keycap-label text-keycap-label text-on-surface">
                    SHIFT
                  </div>
                  <span className="font-body-md text-on-surface-variant">Manastop (Combo Break)</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-16 h-10 flex items-center justify-center bg-obsidian-grey border border-outline/20 rounded-md keycap-inner font-keycap-label text-keycap-label text-on-surface">
                    TAB
                  </div>
                  <span className="font-body-md text-on-surface-variant">Character Sheet</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-stack-lg bg-void-black border-t border-outline-variant/30">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin-mobile md:px-gutter max-w-container-max mx-auto space-y-stack-md md:space-y-0">
          <div className="font-display-hero text-headline-lg text-paragon-gold">PARAGON</div>
          <div className="flex flex-wrap justify-center gap-6">
            <span className="font-body-md text-body-md text-outline">Terms of Service</span>
            <span className="font-body-md text-body-md text-outline">Privacy Policy</span>
            <span className="font-body-md text-body-md text-outline">Community Guidelines</span>
            <span className="font-body-md text-body-md text-outline">Support</span>
          </div>
          <div className="font-body-md text-body-md text-outline-variant text-center md:text-right uppercase tracking-widest text-[10px]">
            © 2026 PARAGON. ALL RIGHTS RESERVED.
          </div>
        </div>
      </footer>
    </main>
  );
}

import React, { useState } from "react";
import { Check, Palette, SlidersHorizontal, Info } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "./Modal";
import {
  useSettingsStore,
  Theme,
  FontFamily,
  THEME_META,
  FONT_META,
  getThemeColors,
} from "../../store/settingsStore";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "appearance" | "editor" | "about";

const TABS: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "editor", label: "Editor", icon: SlidersHorizontal },
  { id: "about", label: "About", icon: Info },
];

// ─── Mini theme preview ──────────────────────────────────────────────────
function ThemeSwatch({ themeId, selected, onSelect }: { themeId: Theme; selected: boolean; onSelect: () => void }) {
  const colors = getThemeColors(themeId);
  const meta = THEME_META[themeId];
  const bg = colors["--color-bg"];
  const surface = colors["--color-surface"];
  const surfaceRaised = colors["--color-surface-raised"];
  const accent = colors["--color-accent"];
  const border = colors["--color-border"];
  const textPrimary = colors["--color-text-primary"];
  const textMuted = colors["--color-text-muted"];

  return (
    <button
      onClick={onSelect}
      className={`relative rounded-xl p-[2px] transition-all duration-200 ${
        selected
          ? "ring-2 ring-accent ring-offset-2 ring-offset-bg"
          : "ring-1 ring-white/[0.06] hover:ring-white/[0.12]"
      }`}
    >
      {/* Live mini-preview */}
      <div className="rounded-[10px] overflow-hidden w-full" style={{ background: bg }}>
        {/* Fake topbar */}
        <div className="h-4 flex items-center px-2 gap-1" style={{ background: surface, borderBottom: `1px solid ${border}` }}>
          <div className="w-[4px] h-[4px] rounded-full" style={{ background: textMuted }} />
          <div className="w-[4px] h-[4px] rounded-full" style={{ background: textMuted }} />
          <div className="w-[4px] h-[4px] rounded-full" style={{ background: textMuted }} />
          <div className="flex-1" />
          <div className="w-8 h-[5px] rounded-sm" style={{ background: accent }} />
        </div>
        {/* Fake editor layout */}
        <div className="flex h-[52px]">
          {/* Sidebar */}
          <div className="w-[28%] p-1.5 flex flex-col gap-1" style={{ background: surface, borderRight: `1px solid ${border}` }}>
            <div className="h-[5px] w-[70%] rounded-sm" style={{ background: textMuted, opacity: 0.4 }} />
            <div className="h-[5px] w-[50%] rounded-sm" style={{ background: textMuted, opacity: 0.3 }} />
            <div className="h-[5px] w-[60%] rounded-sm" style={{ background: textMuted, opacity: 0.25 }} />
          </div>
          {/* Preview area */}
          <div className="flex-1 flex items-center justify-center">
            <div className="w-[36px] h-[28px] rounded-[3px]" style={{ background: surfaceRaised, border: `1px solid ${border}` }} />
          </div>
        </div>
        {/* Fake timeline */}
        <div className="h-[14px] flex items-center gap-[3px] px-1.5" style={{ background: surface, borderTop: `1px solid ${border}` }}>
          <div className="h-[6px] flex-1 rounded-sm" style={{ background: accent, opacity: 0.5 }} />
          <div className="h-[6px] w-[30%] rounded-sm" style={{ background: surfaceRaised }} />
        </div>
      </div>

      {/* Label */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <div className="text-left">
          <div className="text-[11px] font-semibold text-text-primary leading-tight">{meta.name}</div>
          <div className="text-[9px] text-text-muted leading-tight">{meta.description}</div>
        </div>
        {selected && (
          <div className="w-[16px] h-[16px] rounded-full bg-accent flex items-center justify-center shrink-0">
            <Check className="w-[10px] h-[10px] text-white" />
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Appearance Tab ──────────────────────────────────────────────────────
function AppearanceTab() {
  const { theme, fontFamily, setTheme, setFontFamily } = useSettingsStore();
  const themeKeys: Theme[] = ["dark", "midnight", "ocean", "forest"];
  const fontKeys: FontFamily[] = ["inter", "system", "mono", "roboto", "poppins", "outfit"];

  return (
    <div className="space-y-7">
      {/* Themes */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">Theme</h3>
        <div className="grid grid-cols-2 gap-3">
          {themeKeys.map((t) => (
            <ThemeSwatch key={t} themeId={t} selected={theme === t} onSelect={() => setTheme(t)} />
          ))}
        </div>
      </section>

      {/* Font Family */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">Font</h3>
        <div className="grid grid-cols-3 gap-2">
          {fontKeys.map((f) => {
            const meta = FONT_META[f];
            const isSel = fontFamily === f;
            return (
              <button
                key={f}
                onClick={() => setFontFamily(f)}
                className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-lg border transition-all ${
                  isSel
                    ? "border-accent bg-accent/[0.08] text-accent"
                    : "border-white/[0.06] hover:border-white/[0.12] text-text-muted hover:text-text-primary"
                }`}
              >
                <span
                  className="text-lg leading-none"
                  style={{ fontFamily: meta.stack }}
                >
                  Aa
                </span>
                <span className="text-[10px] font-medium">{meta.name}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─── Editor Tab ──────────────────────────────────────────────────────────
function EditorTab() {
  const {
    snapToGrid, autoRipple, autoSave, defaultFrameRate,
    setSnapToGrid, setAutoRipple, setAutoSave, setDefaultFrameRate,
  } = useSettingsStore();

  const frameRates: Array<{ value: 24 | 30 | 60; label: string }> = [
    { value: 24, label: "24" },
    { value: 30, label: "30" },
    { value: 60, label: "60" },
  ];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">Timeline</h3>
        <div className="space-y-3">
          <SettingRow label="Snap to grid" description="Clips snap to ruler ticks when dragging">
            <ToggleSwitch checked={snapToGrid} onChange={setSnapToGrid} />
          </SettingRow>
          <SettingRow label="Auto-ripple" description="Automatically close gaps when deleting clips">
            <ToggleSwitch checked={autoRipple} onChange={setAutoRipple} />
          </SettingRow>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">Project</h3>
        <div className="space-y-3">
          <SettingRow label="Auto-save" description="Periodically save project state">
            <ToggleSwitch checked={autoSave} onChange={setAutoSave} />
          </SettingRow>
          <SettingRow label="Default frame rate" description="Frame rate for new projects">
            <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
              {frameRates.map((fr) => (
                <button
                  key={fr.value}
                  onClick={() => setDefaultFrameRate(fr.value)}
                  className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                    defaultFrameRate === fr.value
                      ? "bg-accent text-white"
                      : "bg-surface-raised text-text-muted hover:text-text-primary hover:bg-white/[0.06]"
                  }`}
                >
                  {fr.label}
                </button>
              ))}
              <span className="px-2 py-1 text-[10px] text-text-muted bg-surface-raised flex items-center">fps</span>
            </div>
          </SettingRow>
        </div>
      </section>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <div className="text-[13px] text-text-primary">{label}</div>
        <div className="text-[11px] text-text-muted">{description}</div>
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      } ${checked ? "bg-accent" : "bg-white/[0.1]"}`}
    >
      <div
        className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${
          checked ? "left-[18px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

// ─── Brand Icons ─────────────────────────────────────────────────────────
const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const XIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

// ─── About Tab ───────────────────────────────────────────────────────────
function AboutTab() {
  return (
    <div className="flex flex-col items-center text-center py-6 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
        <span className="text-2xl font-bold text-accent">C</span>
      </div>
      <div>
        <h3 className="text-lg font-bold text-text-primary">Clypra</h3>
        <p className="text-xs text-text-muted mt-1">Version 0.1.0 (dev)</p>
      </div>
      <p className="text-xs text-text-muted max-w-[280px] leading-relaxed">
        A modern, native video editor built with Tauri, React, and FFmpeg.
        Designed for speed and creative freedom.
      </p>
      <div className="flex items-center gap-4 mt-2">
        <button 
          onClick={() => openUrl("https://github.com/AIEraDev/clypra")}
          className="text-xs font-medium text-text-muted hover:text-accent transition-colors flex items-center gap-1.5"
        >
          <GithubIcon className="w-3.5 h-3.5" />
          GitHub
        </button>
        <button 
          onClick={() => openUrl("https://x.com/AIEraDev")}
          className="text-xs font-medium text-text-muted hover:text-accent transition-colors flex items-center gap-1.5"
        >
          <XIcon className="w-3.5 h-3.5" />
          @AIEraDev
        </button>
      </div>

      <div className="flex gap-4 text-[10px] text-text-muted/60 mt-4 border-t border-white/5 pt-4">
        <span>Tauri 2.x</span>
        <span>•</span>
        <span>React 19</span>
        <span>•</span>
        <span>FFmpeg</span>
      </div>
    </div>
  );
}

// ─── Main Settings Modal ─────────────────────────────────────────────────
export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<Tab>("appearance");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" size="lg">
      <div className="flex min-h-[420px]">
        {/* Sidebar */}
        <div className="w-[160px] shrink-0 border-r border-white/[0.06] p-2 flex flex-col gap-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-accent/[0.1] text-accent"
                    : "text-text-muted hover:text-text-primary hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 p-5 overflow-y-auto">
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "editor" && <EditorTab />}
          {activeTab === "about" && <AboutTab />}
        </div>
      </div>
    </Modal>
  );
};

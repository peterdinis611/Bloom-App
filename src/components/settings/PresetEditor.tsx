import { Plus, Trash2, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PipPosition, PipSize } from "@/lib/capture"
import {
  BUILTIN_PRESETS,
  isBuiltinPreset,
  newPresetId,
  type RecordingPreset,
} from "@/lib/presets"
import type { RecordingSource } from "@/types"

interface PresetEditorProps {
  presets: RecordingPreset[]
  onChange: (presets: RecordingPreset[]) => void
}

const SOURCES: RecordingSource[] = ["screen", "camera", "both"]

function PresetForm({ preset, onUpdate, onDelete, canDelete }: {
  preset: RecordingPreset
  onUpdate: (p: RecordingPreset) => void
  onDelete: () => void
  canDelete: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-start gap-2">
        <input
          value={preset.name}
          onChange={(e) => onUpdate({ ...preset, name: e.target.value })}
          className="flex-1 rounded-lg border border-border/60 bg-[var(--surface)] px-2.5 py-1.5 text-sm font-bold outline-none focus:border-primary/40"
          placeholder="Preset name"
        />
        {canDelete && (
          <button onClick={onDelete} className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <input
        value={preset.description}
        onChange={(e) => onUpdate({ ...preset, description: e.target.value })}
        className="rounded-lg border border-border/60 bg-[var(--surface)] px-2.5 py-1.5 text-xs outline-none focus:border-primary/40"
        placeholder="Short description"
      />
      <div className="flex flex-wrap gap-1.5">
        {SOURCES.map((s) => (
          <button
            key={s}
            onClick={() => onUpdate({ ...preset, source: s })}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11px] font-bold capitalize",
              preset.source === s ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <label className="flex flex-col gap-1">
          <span className="font-bold text-muted-foreground/70">Quality</span>
          <select
            value={preset.quality}
            onChange={(e) => onUpdate({ ...preset, quality: e.target.value as "720p" | "1080p" })}
            className="rounded-lg border border-border/60 bg-[var(--surface)] px-2 py-1.5"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold text-muted-foreground/70">Countdown</span>
          <select
            value={preset.countdown}
            onChange={(e) => onUpdate({ ...preset, countdown: Number(e.target.value) as 0 | 3 | 5 })}
            className="rounded-lg border border-border/60 bg-[var(--surface)] px-2 py-1.5"
          >
            <option value={0}>Off</option>
            <option value={3}>3s</option>
            <option value={5}>5s</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {([
          ["microphone", "Mic"],
          ["systemAudio", "System audio"],
          ["cursorHighlight", "Cursor spotlight"],
          ["cameraBlur", "Camera blur"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onUpdate({ ...preset, [key]: !preset[key] })}
            className={cn(
              "rounded-lg border px-2 py-1 text-[10px] font-bold",
              preset[key] ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {preset.source === "both" && (
        <div className="flex gap-2">
          <select
            value={preset.pipSize}
            onChange={(e) => onUpdate({ ...preset, pipSize: e.target.value as PipSize })}
            className="flex-1 rounded-lg border border-border/60 bg-[var(--surface)] px-2 py-1 text-[11px]"
          >
            <option value="small">PiP S</option>
            <option value="medium">PiP M</option>
            <option value="large">PiP L</option>
          </select>
          <select
            value={preset.pipPosition}
            onChange={(e) => onUpdate({ ...preset, pipPosition: e.target.value as PipPosition })}
            className="flex-1 rounded-lg border border-border/60 bg-[var(--surface)] px-2 py-1 text-[11px]"
          >
            <option value="bottom-right">BR</option>
            <option value="bottom-left">BL</option>
            <option value="top-right">TR</option>
            <option value="top-left">TL</option>
          </select>
        </div>
      )}
      {isBuiltinPreset(preset.id) && (
        <p className="text-[10px] text-muted-foreground/70">Built-in preset — duplicate to customise.</p>
      )}
    </div>
  )
}

export function PresetEditor({ presets, onChange }: PresetEditorProps) {
  const update = (id: string, next: RecordingPreset) => {
    onChange(presets.map((p) => (p.id === id ? next : p)))
  }

  const duplicate = (p: RecordingPreset) => {
    const copy: RecordingPreset = { ...p, id: newPresetId(), name: `${p.name} copy` }
    onChange([...presets, copy])
  }

  const addCustom = () => {
    const base = BUILTIN_PRESETS[0]
    onChange([...presets, { ...base, id: newPresetId(), name: "My preset", description: "Custom profile" }])
  }

  const remove = (id: string) => {
    if (isBuiltinPreset(id)) return
    onChange(presets.filter((p) => p.id !== id))
  }

  return (
    <div className="flex flex-col gap-3">
      {presets.map((p) => (
        <div key={p.id} className="relative">
          <PresetForm
            preset={p}
            onUpdate={(next) => update(p.id, next)}
            onDelete={() => remove(p.id)}
            canDelete={!isBuiltinPreset(p.id)}
          />
          <button
            onClick={() => duplicate(p)}
            className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-3" /> Duplicate
          </button>
        </div>
      ))}
      <button
        onClick={addCustom}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-3 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary"
      >
        <Plus className="size-4" /> Add custom preset
      </button>
    </div>
  )
}

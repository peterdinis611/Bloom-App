import { Plus, Trash2, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PipPosition, PipSize } from "@/lib/capture"
import {
  BUILTIN_PRESETS,
  isBuiltinPreset,
  newPresetId,
  type RecordingPreset,
} from "@/lib/presets"
import { sk } from "@/lib/i18n/sk"
import { RECORDING_QUALITIES } from "@/lib/videoOptions"
import { ChoiceGroup } from "@/components/mac/MacUIKit"
import type { RecordingSource } from "@/types"

interface PresetEditorProps {
  presets: RecordingPreset[]
  onChange: (presets: RecordingPreset[]) => void
}

const SOURCES: { value: RecordingSource; label: string }[] = [
  { value: "screen", label: sk.record.sources.screen },
  { value: "camera", label: sk.record.sources.camera },
  { value: "both", label: sk.record.sources.both },
]

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
          className="flex-1 rounded-lg border border-border/60 bg-[var(--surface)] px-2.5 py-2 text-sm font-bold outline-none focus:border-primary/40"
          placeholder="Názov predvoľby"
        />
        {canDelete && (
          <button type="button" onClick={onDelete} className="rounded-lg p-2.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <input
        value={preset.description}
        onChange={(e) => onUpdate({ ...preset, description: e.target.value })}
        className="rounded-lg border border-border/60 bg-[var(--surface)] px-2.5 py-2 text-xs outline-none focus:border-primary/40"
        placeholder="Krátky popis"
      />
      <ChoiceGroup
        label={sk.record.source}
        options={SOURCES}
        value={preset.source}
        onChange={(v) => onUpdate({ ...preset, source: v })}
      />
      <ChoiceGroup
        label={sk.record.quality}
        options={RECORDING_QUALITIES.map((q) => ({ value: q, label: sk.qualities[q] }))}
        value={preset.quality}
        onChange={(v) => onUpdate({ ...preset, quality: v })}
      />
      <ChoiceGroup
        label={sk.record.countdown}
        options={[
          { value: "0", label: sk.record.countdownOff },
          { value: "3", label: "3 s" },
          { value: "5", label: "5 s" },
        ]}
        value={String(preset.countdown)}
        onChange={(v) => onUpdate({ ...preset, countdown: Number(v) as 0 | 3 | 5 })}
      />
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">Možnosti</p>
        <div className="choice-group choice-group-wrap">
          {([
            ["microphone", sk.record.microphone],
            ["systemAudio", sk.record.systemAudio],
            ["cursorHighlight", sk.settings.cursorSpotlight],
            ["cameraBlur", sk.settings.cameraBlur],
          ] as const).map(([key, label]) => {
            const on = preset[key]
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => onUpdate({ ...preset, [key]: !on })}
                className={cn("choice-chip", on && "choice-chip-active")}
              >
                <span className={cn("choice-chip-indicator", on && "choice-chip-indicator-active")}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      </div>
      {preset.source === "both" && (
        <>
          <ChoiceGroup
            label={sk.record.pipSize}
            options={([
              ["small", sk.record.pipSizes.small],
              ["medium", sk.record.pipSizes.medium],
              ["large", sk.record.pipSizes.large],
            ] as const).map(([value, label]) => ({ value, label }))}
            value={preset.pipSize}
            onChange={(v) => onUpdate({ ...preset, pipSize: v as PipSize })}
          />
          <ChoiceGroup
            label={sk.record.pipPosition}
            layout="wrap"
            options={([
              ["bottom-right", sk.record.pipPositions["bottom-right"]],
              ["bottom-left", sk.record.pipPositions["bottom-left"]],
              ["top-right", sk.record.pipPositions["top-right"]],
              ["top-left", sk.record.pipPositions["top-left"]],
            ] as const).map(([value, label]) => ({ value, label }))}
            value={preset.pipPosition}
            onChange={(v) => onUpdate({ ...preset, pipPosition: v as PipPosition })}
          />
        </>
      )}
      {isBuiltinPreset(preset.id) && (
        <p className="text-[10px] text-muted-foreground/70">Vstavaná predvoľba — duplikuj pre úpravu.</p>
      )}
    </div>
  )
}

export function PresetEditor({ presets, onChange }: PresetEditorProps) {
  const update = (id: string, next: RecordingPreset) => {
    onChange(presets.map((p) => (p.id === id ? next : p)))
  }

  const duplicate = (p: RecordingPreset) => {
    const copy: RecordingPreset = { ...p, id: newPresetId(), name: `${p.name} (kópia)` }
    onChange([...presets, copy])
  }

  const addCustom = () => {
    const base = BUILTIN_PRESETS[0]
    onChange([...presets, { ...base, id: newPresetId(), name: "Moja predvoľba", description: "Vlastný profil" }])
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
            type="button"
            onClick={() => duplicate(p)}
            className="mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Copy className="size-3" /> Duplikovať
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addCustom}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-3 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary"
      >
        <Plus className="size-4" /> Pridať vlastnú predvoľbu
      </button>
    </div>
  )
}

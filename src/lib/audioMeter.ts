/** Lightweight Web Audio level meter for a MediaStream audio track. */

export interface AudioMeter {
  /** Current RMS level 0–1. */
  level: number
  stop: () => void
}

export function createAudioMeter(stream: MediaStream | null): AudioMeter | null {
  const track = stream?.getAudioTracks()[0]
  if (!track) return null

  try {
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(new MediaStream([track]))
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    const buf = new Uint8Array(analyser.frequencyBinCount)
    let level = 0
    let raf = 0

    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      level = Math.min(1, Math.sqrt(sum / buf.length) * 3)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return {
      get level() { return level },
      stop: () => {
        cancelAnimationFrame(raf)
        source.disconnect()
        ctx.close().catch(() => {})
      },
    }
  } catch {
    return null
  }
}

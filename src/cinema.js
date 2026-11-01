// A soft "lighthouse" chime made in the browser (no audio file to download).
// Browsers only allow sound after a click or key press, so it never plays by itself.
let ctx
export function chime() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0.18; out.connect(ctx.destination)
    // a warm pad (C major 9, low) under a two-note bell
    const pad = [130.81, 196.0, 246.94, 293.66, 329.63]
    pad.forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; o.detune.value = (i % 2 ? 4 : -4)
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.22 / pad.length * 2, now + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, now + 4.2); o.connect(g); g.connect(out); o.start(now); o.stop(now + 4.3) })
    ;[[1046.5, 0.35], [1567.98, 0.75]].forEach(([f, at]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = f
      g.gain.setValueAtTime(0, now + at); g.gain.linearRampToValueAtTime(0.12, now + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + at + 2.2); o.connect(g); g.connect(out); o.start(now + at); o.stop(now + at + 2.3) })
  } catch { /* no audio on this device */ }
}
export const soundOn = () => { try { return localStorage.getItem('sb_sound') === '1' } catch { return false } }
export const setSound = (v) => { try { localStorage.setItem('sb_sound', v ? '1' : '0') } catch { /* private mode */ } }

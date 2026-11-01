// Budgootee: a little golden drop of oil who floats around the screen and answers questions about smartBudget,
// in Arabic or English, by typing or by voice, and talks back.
// He talks to the "budgootee" Supabase function, which holds the AI key and answers only from our own guide.
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export function OilDrop({ state = 'idle', size = 56 }) {
  // state: idle (blinks, wobbles) · think (shine swirls) · talk (mouth moves, bounces) · listen (eyes wide, rings)
  return <svg className={'od ' + state} width={size} height={size} viewBox="0 0 64 72" aria-hidden="true">
    <defs>
      <linearGradient id="odg" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stopColor="#FFF0BE" /><stop offset=".45" stopColor="#F2BE4E" /><stop offset="1" stopColor="#B87A0E" /></linearGradient>
      <radialGradient id="odh" cx="35%" cy="35%" r="60%"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
    </defs>
    <g className="od-rings"><circle cx="32" cy="44" r="24" /><circle cx="32" cy="44" r="24" /></g>
    <g className="od-body">
      <path d="M32 3 C36 14 54 30 54 46 A22 22 0 0 1 10 46 C10 30 28 14 32 3 Z" fill="url(#odg)" stroke="#9A6408" strokeWidth="1.6" />
      <ellipse className="od-shine" cx="22" cy="34" rx="5" ry="9" fill="url(#odh)" transform="rotate(25 22 34)" />
      <circle cx="44" cy="54" r="2" fill="#fff" opacity=".55" />
      <g className="od-eyes"><ellipse cx="25" cy="45" rx="3.1" ry="3.6" fill="#3A2604" /><ellipse cx="39" cy="45" rx="3.1" ry="3.6" fill="#3A2604" /><circle cx="26.1" cy="43.7" r="1.1" fill="#fff" /><circle cx="40.1" cy="43.7" r="1.1" fill="#fff" /></g>
      <path className="od-mouth" d="M28 52 Q32 56 36 52" stroke="#3A2604" strokeWidth="1.8" fill="#7A3A06" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="19.5" cy="51" rx="2.6" ry="1.6" fill="#F08A5D" opacity=".7" /><ellipse cx="44.5" cy="51" rx="2.6" ry="1.6" fill="#F08A5D" opacity=".7" />
    </g>
  </svg>
}

const URL_FN = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/budgootee'
const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1' } catch { return d } }
const setPref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0') } catch { /* private mode */ } }
const calm = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

// ---- his voice: the computer's own voices (Edge and Chrome have good Arabic and English ones) ----
const AR = /[؀-ۿ]/
function voiceFor(ar) {
  const vs = window.speechSynthesis?.getVoices() || []
  const of = (re) => vs.filter(v => re.test(v.lang))
  const list = ar ? [...of(/^ar-EG/i), ...of(/^ar/i)] : [...of(/^en-(GB|US)/i), ...of(/^en/i)]
  return list.find(v => /natural|online|neural/i.test(v.name)) || list.find(v => /google|microsoft/i.test(v.name)) || list[0] || null
}
const clean = (s) => s.replace(/[*_#`>|~]/g, ' ').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim()
function speak(text, onStart, onEnd) {
  const ss = window.speechSynthesis; if (!ss || !text) { onEnd?.(); return false }
  ss.cancel()
  const ar = AR.test(text), v = voiceFor(ar)
  if (!v) { onEnd?.(); return false }
  // Chrome cuts long speech after about 15 seconds, so he reads sentence by sentence
  const parts = clean(text).split(/(?<=[.!?؟؛\n])\s+/).filter(Boolean)
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p); u.voice = v; u.lang = v.lang; u.rate = ar ? 0.95 : 1; u.pitch = 1.15
    if (i === 0) u.onstart = onStart
    if (i === parts.length - 1) { u.onend = onEnd; u.onerror = onEnd }
    ss.speak(u)
  })
  return true
}
try { window.speechSynthesis?.getVoices() } catch { /* voices load late in Chrome */ }

// ---- floating around the page, like a friendly ghost ----
function useRoam(on) {
  const [pos, setPos] = useState(null), [face, setFace] = useState(1), [peek, setPeek] = useState(false)
  const hold = useRef(false), moves = useRef(0)
  useEffect(() => {
    const home = () => ({ x: window.innerWidth - 104, y: window.innerHeight - 110 })
    if (!on) { setPos(home()); return }
    let id
    const busyTyping = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')
    const step = () => {
      if (!hold.current && !busyTyping() && !document.hidden) {
        const W = window.innerWidth, H = window.innerHeight, small = W < 700
        const x = 12 + Math.random() * (W - 112), y = (small ? H * 0.55 : 110) + Math.random() * (H - (small ? H * 0.55 : 110) - 110)
        setPos(p => { if (p) setFace(x < p.x ? -1 : 1); return { x, y } })
        moves.current++
        // every third stop he says hello for a moment
        if (moves.current % 3 === 0) { setTimeout(() => setPeek(true), 5200); setTimeout(() => setPeek(false), 9000) }
      }
      id = setTimeout(step, 9000 + Math.random() * 5000)
    }
    setPos(home()); id = setTimeout(step, 4000)
    const fit = () => setPos(p => p && { x: Math.min(p.x, window.innerWidth - 104), y: Math.min(p.y, window.innerHeight - 110) })
    window.addEventListener('resize', fit)
    return () => { clearTimeout(id); window.removeEventListener('resize', fit) }
  }, [on])
  return { pos, face, peek, hold }
}

export default function Budgootee({ t, lang, profile, screen }) {
  const [open, setOpen] = useState(false), [msgs, setMsgs] = useState([]), [q, setQ] = useState(''), [busy, setBusy] = useState(false)
  const [talking, setTalking] = useState(false), [listening, setListening] = useState(false), [note, setNote] = useState('')
  const [voiceOn, setVoiceOn] = useState(() => pref('bgt_voice', true)), [roamOn, setRoamOn] = useState(() => pref('bgt_roam', true) && !calm())
  const end = useRef(null), input = useRef(null), rec = useRef(null)
  const { pos, face, peek, hold } = useRoam(roamOn && !open)
  // he only shows up once his function is live and has a key
  const [ready, setReady] = useState(false)
  useEffect(() => { fetch(URL_FN, { headers: { apikey: import.meta.env.VITE_SUPABASE_KEY } }).then(r => r.ok ? r.json() : null).then(j => setReady(!!j?.ready)).catch(() => {}) }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, open])
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 150); else { window.speechSynthesis?.cancel(); rec.current?.abort?.() } }, [open])

  const say = (text) => { if (!speak(text, () => setTalking(true), () => setTalking(false))) { setTalking(false); if (text && !voiceFor(AR.test(text))) setNote(t('bot_no_voice')) } }
  const ask = async (text, byVoice) => {
    text = (text || '').trim(); if (!text || busy) return
    window.speechSynthesis?.cancel(); setNote('')
    const next = [...msgs, { role: 'user', content: text }]; setMsgs([...next, { role: 'assistant', content: '' }]); setQ(''); setBusy(true)
    const put = (s) => setMsgs(m => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: s }; return c })
    let s = ''
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token, apikey: import.meta.env.VITE_SUPABASE_KEY },
        body: JSON.stringify({ messages: next.filter(m => m.content), screen, lang, role: profile?.role }) })
      if (!r.ok || !r.body) { const e = await r.json().catch(() => ({})); put(t(e.error === 'cap' ? 'bot_cap' : r.status === 404 || e.error === 'no_key' ? 'bot_wait' : 'bot_err')); return }
      const rd = r.body.getReader(), dec = new TextDecoder()
      for (;;) { const { done, value } = await rd.read(); if (done) break; s += dec.decode(value, { stream: true }); put(s) }
      if (!s) put(t('bot_err'))
    } catch { put(t('bot_wait')) } finally { setBusy(false); if (s && (voiceOn || byVoice)) say(s) }
  }

  // talking to him: the browser's own speech recognition (Chrome, Edge, Safari). Brave and Firefox block it.
  const listen = () => {
    if (listening) { rec.current?.stop(); return }
    window.speechSynthesis?.cancel(); setNote('')
    if (!SR) { setNote(t('bot_mic_no')); return }
    const r = new SR(); rec.current = r
    r.lang = lang === 'ar' ? 'ar-EG' : 'en-US'; r.interimResults = true; r.continuous = false
    let heard = ''
    r.onresult = (e) => { heard = Array.from(e.results).map(x => x[0].transcript).join(' '); setQ(heard) }
    r.onerror = (e) => { setNote(t(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? (navigator.brave ? 'bot_mic_no' : 'bot_mic_block') : e.error === 'no-speech' ? 'bot_mic_none' : 'bot_mic_no')) }
    r.onend = () => { setListening(false); if (heard.trim()) ask(heard, true) }
    try { r.start(); setListening(true) } catch { setNote(t('bot_mic_no')) }
  }

  const state = listening ? 'listen' : talking ? 'talk' : busy ? (msgs[msgs.length - 1]?.content ? 'talk' : 'think') : 'idle'
  if (!ready || !pos) return null
  return <>
    {!open && <div className={'bgt-fly' + (roamOn ? ' roam' : '')} style={{ transform: `translate(${pos.x}px,${pos.y}px)` }}>
      <button className="bgt-fab" style={{ '--face': face }} onClick={() => setOpen(true)} onMouseEnter={() => { hold.current = true }} onMouseLeave={() => { hold.current = false }}
        title={t('bot_name')} aria-label={t('bot_name')}>
        <OilDrop state="idle" size={84} /><span className="bgt-shadow" />
      </button>
      {peek && <span className="bgt-peek" onClick={() => setOpen(true)}>{t('bot_peek')}</span>}
    </div>}
    {open && <div className="bgt" role="dialog" aria-label={t('bot_name')}>
      <div className="bgt-h"><OilDrop state={state} size={46} /><div><b>{t('bot_name')}</b><small>{listening ? t('bot_listen') : busy ? t('bot_thinking') : talking ? t('bot_talking') : t('bot_sub')}</small></div><span className="sp" />
        <button className="btn ghost sm" title={t(voiceOn ? 'bot_voice_off' : 'bot_voice_on')} aria-pressed={voiceOn} onClick={() => { const v = !voiceOn; setVoiceOn(v); setPref('bgt_voice', v); if (!v) window.speechSynthesis?.cancel() }}>{voiceOn ? '🔊' : '🔈'}</button>
        <button className="btn ghost sm" title={t(roamOn ? 'bot_stay' : 'bot_roam')} aria-pressed={roamOn} onClick={() => { const v = !roamOn; setRoamOn(v); setPref('bgt_roam', v) }}>{roamOn ? '📌' : '🕊️'}</button>
        {msgs.length > 0 && <button className="btn ghost sm" title={t('bot_new')} onClick={() => { window.speechSynthesis?.cancel(); setMsgs([]) }}>↺</button>}<button className="btn ghost sm" onClick={() => setOpen(false)} aria-label="close">✕</button></div>
      <div className="bgt-b">
        <div className="bgt-m a">{t('bot_hi')}</div>
        {msgs.length === 0 && <div className="bgt-chips">{['bot_s1', 'bot_s2', 'bot_s3'].map(k => <button key={k} onClick={() => ask(t(k))}>{t(k)}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={'bgt-m ' + (m.role === 'user' ? 'u' : 'a')} dir="auto">{m.content || <span className="bgt-dots"><i /><i /><i /></span>}
          {m.role === 'assistant' && m.content && !busy && <button className="bgt-say" title={t('bot_say')} onClick={() => say(m.content)}>🔊</button>}</div>)}
        <div ref={end} />
      </div>
      {note && <div className="bgt-note" dir="auto">{note}</div>}
      <form className="bgt-f" onSubmit={e => { e.preventDefault(); ask(q) }}>
        <button type="button" className={'bgt-mic' + (listening ? ' on' : '')} onClick={listen} title={t('bot_mic')} aria-label={t('bot_mic')} aria-pressed={listening}>{listening ? '■' : '🎙️'}</button>
        <input ref={input} value={q} dir="auto" maxLength={600} placeholder={listening ? t('bot_listen') : t('bot_ph')} onChange={e => setQ(e.target.value)} />
        <button className="btn p" disabled={busy || !q.trim()}>{t('bot_send')}</button></form>
    </div>}
  </>
}

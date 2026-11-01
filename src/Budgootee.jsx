// Budgootee: the little lighthouse who answers questions about smartBudget, in Arabic or English.
// He talks to the "budgootee" Supabase function, which holds the AI key and answers only from our own guide.
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export function Lighthouse({ state = 'idle', size = 56 }) {
  // state: idle (blinks) · think (beam sweeps) · talk (bobs)
  return <svg className={'lh ' + state} width={size} height={size} viewBox="14 0 36 62" aria-hidden="true">
    <defs><radialGradient id="lhglow" cx="50%" cy="30%" r="60%"><stop offset="0" stopColor="#FFE7A3" /><stop offset="1" stopColor="#FFE7A3" stopOpacity="0" /></radialGradient></defs>
    <g className="lh-beam"><path d="M32 16 L64 4 L64 28 Z" fill="#FFE7A3" opacity=".55" /><path d="M32 16 L0 4 L0 28 Z" fill="#FFE7A3" opacity=".55" /></g>
    <circle cx="32" cy="16" r="14" fill="url(#lhglow)" className="lh-glow" />
    <g className="lh-body">
      <path d="M26 7 L32 2 L38 7 Z" fill="#C9530F" />
      <rect x="23" y="7" width="18" height="15" rx="4" fill="#FFF6E0" stroke="#0B3550" strokeWidth="2" />
      <g className="lh-eyes"><circle cx="28.5" cy="14.5" r="2.2" fill="#0B3550" /><circle cx="35.5" cy="14.5" r="2.2" fill="#0B3550" /><circle cx="29.2" cy="13.8" r=".7" fill="#fff" /><circle cx="36.2" cy="13.8" r=".7" fill="#fff" /></g>
      <path d="M29.5 18.5 Q32 20.5 34.5 18.5" stroke="#0B3550" strokeWidth="1.4" fill="none" strokeLinecap="round" className="lh-mouth" />
      <circle cx="26" cy="18.3" r="1.3" fill="#F49A7A" opacity=".8" /><circle cx="38" cy="18.3" r="1.3" fill="#F49A7A" opacity=".8" />
      <rect x="21" y="22" width="22" height="3" rx="1.5" fill="#0B3550" />
      <path d="M23.5 25 L40.5 25 L44 58 L20 58 Z" fill="#fff" stroke="#0B3550" strokeWidth="2" strokeLinejoin="round" />
      <path d="M22.6 33 L41.4 33 L42.3 41 L21.7 41 Z" fill="#F16C20" /><path d="M21 49 L43 49 L43.8 56.5 L20.2 56.5 Z" fill="#F16C20" />
      <rect x="29" y="42.5" width="6" height="6" rx="3" fill="#0B3550" opacity=".85" />
      <rect x="16" y="57" width="32" height="4" rx="2" fill="#0B3550" />
    </g>
  </svg>
}

const URL_FN = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/budgootee'

export default function Budgootee({ t, lang, profile, screen }) {
  const [open, setOpen] = useState(false), [msgs, setMsgs] = useState([]), [q, setQ] = useState(''), [busy, setBusy] = useState(false)
  const end = useRef(null), input = useRef(null)
  // he only shows up once his function is live and has a key
  const [ready, setReady] = useState(false)
  useEffect(() => { fetch(URL_FN, { headers: { apikey: import.meta.env.VITE_SUPABASE_KEY } }).then(r => r.ok ? r.json() : null).then(j => setReady(!!j?.ready)).catch(() => {}) }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, open])
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 150) }, [open])
  const ask = async (text) => {
    text = (text || '').trim(); if (!text || busy) return
    const next = [...msgs, { role: 'user', content: text }]; setMsgs([...next, { role: 'assistant', content: '' }]); setQ(''); setBusy(true)
    const put = (s) => setMsgs(m => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: s }; return c })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token, apikey: import.meta.env.VITE_SUPABASE_KEY },
        body: JSON.stringify({ messages: next.filter(m => m.content), screen, lang, role: profile?.role }) })
      if (!r.ok || !r.body) { const e = await r.json().catch(() => ({})); put(t(e.error === 'cap' ? 'bot_cap' : r.status === 404 || e.error === 'no_key' ? 'bot_wait' : 'bot_err')); return }
      const rd = r.body.getReader(), dec = new TextDecoder(); let s = ''
      for (;;) { const { done, value } = await rd.read(); if (done) break; s += dec.decode(value, { stream: true }); put(s) }
      if (!s) put(t('bot_err'))
    } catch { put(t('bot_wait')) } finally { setBusy(false) }
  }
  const state = busy ? (msgs[msgs.length - 1]?.content ? 'talk' : 'think') : 'idle'
  if (!ready) return null
  return <>
    {!open && <button className="bgt-fab" onClick={() => setOpen(true)} title={t('bot_name')} aria-label={t('bot_name')}><Lighthouse state="idle" /><span className="bgt-tip">{t('bot_tip')}</span></button>}
    {open && <div className="bgt" role="dialog" aria-label={t('bot_name')}>
      <div className="bgt-h"><Lighthouse state={state} size={44} /><div><b>{t('bot_name')}</b><small>{busy ? t('bot_thinking') : t('bot_sub')}</small></div><span className="sp" />
        {msgs.length > 0 && <button className="btn ghost sm" title={t('bot_new')} onClick={() => setMsgs([])}>↺</button>}<button className="btn ghost sm" onClick={() => setOpen(false)} aria-label="close">✕</button></div>
      <div className="bgt-b">
        <div className="bgt-m a">{t('bot_hi')}</div>
        {msgs.length === 0 && <div className="bgt-chips">{['bot_s1', 'bot_s2', 'bot_s3'].map(k => <button key={k} onClick={() => ask(t(k))}>{t(k)}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={'bgt-m ' + (m.role === 'user' ? 'u' : 'a')} dir="auto">{m.content || <span className="bgt-dots"><i /><i /><i /></span>}</div>)}
        <div ref={end} />
      </div>
      <form className="bgt-f" onSubmit={e => { e.preventDefault(); ask(q) }}><input ref={input} value={q} dir="auto" maxLength={600} placeholder={t('bot_ph')} onChange={e => setQ(e.target.value)} /><button className="btn p" disabled={busy || !q.trim()}>{t('bot_send')}</button></form>
    </div>}
  </>
}

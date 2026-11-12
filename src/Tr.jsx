// Cards written in English, shown in Arabic when the app is in Arabic. Reading only: the card is never changed.
// Translations are kept in the browser, so the second time they show at once.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const URL_FN = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/tr'
const KEY = import.meta.env.VITE_SUPABASE_KEY
const LS = 'sb_tr_ar'
let cache = {}
try { cache = JSON.parse(localStorage.getItem(LS) || '{}') } catch { cache = {} }
const save = () => { try { const ks = Object.keys(cache); if (ks.length > 1500) ks.slice(0, ks.length - 1500).forEach(k => delete cache[k]); localStorage.setItem(LS, JSON.stringify(cache)) } catch { /* storage full or blocked */ } }

// mostly Latin letters = written in English
export const isEnglish = (s) => { const x = String(s || ''), la = (x.match(/[A-Za-z]/g) || []).length, ar = (x.match(/[؀-ۿ]/g) || []).length; return la >= 4 && la > ar * 2 }

let queue = [], timer = null, off = false
const waiters = {}
async function flush() {
  timer = null; const batch = [...new Set(queue)].slice(0, 40); queue = queue.filter(x => !batch.includes(x)); if (queue.length) timer = setTimeout(flush, 50)
  const done = (m) => batch.forEach(s => { (waiters[s] || []).forEach(f => f(m?.[s] || null)); delete waiters[s] })
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token, apikey: KEY }, body: JSON.stringify({ texts: batch }) })
    if (r.status === 404 || r.status === 503) off = true
    const j = r.ok ? await r.json() : null
    if (!j?.items) return done(null)
    const m = {}; batch.forEach((s, i) => { m[s] = j.items[i]; cache[s] = j.items[i] }); save(); done(m)
  } catch { done(null) }
}
function ask(s) { return new Promise(res => { if (off) return res(null); (waiters[s] = waiters[s] || []).push(res); queue.push(s); if (!timer) timer = setTimeout(flush, 80) }) }

// the text in Arabic when the app is in Arabic and the text was written in English; otherwise the text as it is
export function useAr(text, lang) {
  const s = String(text || '').trim(), want = lang === 'ar' && isEnglish(s)
  const [v, setV] = useState(want ? cache[s] || null : null)
  useEffect(() => { if (!want) { setV(null); return } if (cache[s]) { setV(cache[s]); return } let live = true; setV(null); ask(s).then(x => live && x && setV(x)); return () => { live = false } }, [s, want])
  return want && v ? v : null
}
export function Tr({ text, lang }) {
  const ar = useAr(text, lang)
  if (!ar) return <>{text}</>
  return <span dir="rtl" title={String(text)}>{ar} <span className="tr-mark" title={String(text)}>🌐</span></span>
}

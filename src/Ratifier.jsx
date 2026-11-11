// The ratifier: the director's own reviewer. It reads a card against the director's rulebook and the
// "who owns what" map, and hands back findings and questions. It never gives a verdict: the director decides.
import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const URL_FN = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/ratifier'
const KEY = import.meta.env.VITE_SUPABASE_KEY

// the button only shows once the function is live and has its key
let readyP = null
export function useRatifier(on) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!on) return
    readyP = readyP || fetch(URL_FN, { headers: { apikey: KEY } }).then(r => r.ok ? r.json() : null).then(j => !!j?.ready).catch(() => false)
    readyP.then(setReady)
  }, [on])
  return ready
}

const depName = (refd, id, lang) => refd.departments.find(d => d.id === id)?.[lang === 'ar' ? 'name_ar' : 'name_en'] || ''

export function RatifyCard({ t, lang, ask, facts, refd, show, onMove, onNote }) {
  const [res, setRes] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const [rule, setRule] = useState(''), [myRules, setMyRules] = useState([])
  useEffect(() => { setRes(null); setErr('') }, [ask.id])
  const run = async (again) => {
    if (busy) return; setBusy(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token, apikey: KEY }, body: JSON.stringify({ ask_id: ask.id, lang, facts, again: !!again }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.result) { setErr(t(j.error === 'cap' ? 'rat_cap' : j.error === 'setup' || j.error === 'no_key' || r.status === 404 ? 'rat_setup' : 'rat_err')); return }
      setRes(j)
      supabase.from('ratifier_rules').select('id, rule').then(({ data }) => setMyRules(data || []))
    } catch { setErr(t('rat_err')) } finally { setBusy(false) }
  }
  const teach = async () => {
    const text = rule.trim(); if (text.length < 3) return
    const { error } = await supabase.from('ratifier_rules').insert({ rule: text, source_ask_id: ask.id })
    if (error) { show(error.message); return }
    setRule(''); show('✓ ' + t('rat_rule_saved'))
  }
  const copy = async (s) => { try { await navigator.clipboard.writeText(s); show('✓ ' + t('rat_copied')) } catch { /* no clipboard */ } }
  const x = res?.result, o = x?.owner
  const L = ({ items, empty }) => items?.length ? <ul>{items.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="m">{empty || t('rat_none')}</p>

  return <div className="card rat" data-help="ratify">
    <div className="rh"><p className="k">🔎 {t('rat_title')}</p>
      {x && <span className="m">{t('rat_cached')} {new Date(res.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</div>
    {!x && <p className="m" style={{ marginTop: -4 }}>{t('rat_hint')}</p>}
    {err && <p className="rat-err">{err}</p>}
    {!x && <div className="btns" style={{ marginTop: 6 }}><button className="btn p" disabled={busy} onClick={() => run(false)}>{busy ? t('rat_busy') : '🔎 ' + t('rat_btn')}</button></div>}
    {x && <>
      <p className="rat-sum">{x.summary}</p>
      <div className={'rat-own ' + (o?.fits || 'unsure')}>
        <b>{t('rat_owner')}</b> <span className="pill">{o?.fits === 'yes' ? '✓ ' + t('rat_own_yes') : o?.fits === 'other' ? t('rat_own_other') + ' ' + depName(refd, o.department_id, lang) : t('rat_own_unsure')}</span>
        {o?.why && <p>{o.why}</p>}
        {o?.fits === 'other' && onMove && <button className="btn y" onClick={() => onMove(o.department_id, o.why)}>{lang === 'ar' ? '↩' : '↪'} {t('rat_move')} {depName(refd, o.department_id, lang)}</button>}
      </div>
      <div className="rat-b"><p className="k">{t('rat_missing')}</p>
        {x.missing?.length ? <ul>{x.missing.map((m, i) => <li key={i}><b>{m.what}</b>{m.why ? ' — ' + m.why : ''}</li>)}</ul> : <p className="m">{t('rat_none')}</p>}</div>
      <div className="grid2 rat-fa"><div className="rat-b for"><p className="k">＋ {t('rat_for')}</p><L items={x.points_for} /></div><div className="rat-b against"><p className="k">－ {t('rat_against')}</p><L items={x.points_against} /></div></div>
      {x.rules?.length > 0 && <div className="rat-b"><p className="k">📜 {t('rat_rules')}</p>
        <ul>{x.rules.map((r, i) => <li key={i}><b>{myRules.find(m => m.id === r.rule_id)?.rule || '#' + r.rule_id}</b> — {r.note}</li>)}</ul></div>}
      {x.duplicates?.length > 0 && <div className="rat-b"><p className="k">👥 {t('rat_dups')}</p><ul>{x.duplicates.map((d, i) => <li key={i}><b>{d.title}</b> — {d.why}</li>)}</ul></div>}
      {x.questions?.length > 0 && <div className="rat-b"><p className="k">❓ {t('rat_qs')}</p>
        <ol>{x.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        <div className="btns" style={{ marginTop: 4 }}>{onNote && <button className="btn" onClick={() => onNote(x.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'))}>✍️ {t('rat_use_note')}</button>}
          <button className="btn ghost" onClick={() => copy(x.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'))}>{t('rat_copy')}</button></div></div>}
      {x.promise && <div className="rat-b"><p className="k">🤝 {t('rat_promise')}</p><p>{x.promise}</p></div>}
      <div className="rat-teach"><label className="f"><span>📜 {t('rat_teach')}</span><input value={rule} onChange={e => setRule(e.target.value)} placeholder={t('rat_teach_ph')} onKeyDown={e => e.key === 'Enter' && teach()} /></label>
        <div className="btns" style={{ marginTop: 4 }}><button className="btn" disabled={rule.trim().length < 3} onClick={teach}>{t('rat_save_rule')}</button>
          <button className="btn ghost" disabled={busy} onClick={() => run(true)}>{busy ? t('rat_busy') : '↻ ' + t('rat_again')}</button></div></div>
      <p className="m rat-foot">{t('rat_foot')}</p>
    </>}
  </div>
}

/* the director's rulebook and the "who owns what" map, both plain lists the director can read and change */
export function Rulebook({ t, lang, refd, show, onBack }) {
  const [rules, setRules] = useState([]), [map, setMap] = useState([]), [off, setOff] = useState(false)
  const [nr, setNr] = useState({ rule: '', applies: '' }), [nm, setNm] = useState({ item: '', words: '', department_id: '' })
  const load = useCallback(async () => {
    const [r, m] = await Promise.all([supabase.from('ratifier_rules').select('*').order('id'), supabase.from('ownership_map').select('*').order('id')])
    if (r.error || m.error) { setOff(true); return }
    setRules(r.data || []); setMap(m.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  const say = (error) => { if (error) show(error.message); else load() }
  const addRule = async () => { if (nr.rule.trim().length < 3) return; const { error } = await supabase.from('ratifier_rules').insert({ rule: nr.rule.trim(), applies: nr.applies.trim() || null }); if (!error) setNr({ rule: '', applies: '' }); say(error) }
  const addMap = async () => { if (nm.item.trim().length < 2 || !nm.department_id) return; const { error } = await supabase.from('ownership_map').insert({ item: nm.item.trim(), words: nm.words.trim() || null, department_id: Number(nm.department_id) }); if (!error) setNm({ item: '', words: '', department_id: '' }); say(error) }
  const BK = lang === 'ar' ? '→' : '←'
  return <>
    <div className="btns" style={{ marginTop: 0 }}><button className="btn" onClick={onBack}>{BK} {t('back')}</button></div>
    {off && <div className="card o"><p>{t('rat_setup')}</p></div>}
    <div className="card book" data-help="rulebook"><h2 style={{ marginTop: 0 }}>📜 {t('rat_book_title')}</h2><p className="m">{t('rat_book_hint')}</p>
      {rules.length === 0 && !off && <p className="m">{t('rat_no_rules')}</p>}
      {rules.map(r => <div key={r.id} className={'rule-row' + (r.active ? '' : ' offd')}>
        <div><b>{r.rule}</b>{r.applies && <div className="m">{t('rat_applies_s')}: {r.applies}</div>}<div className="m">{t('rat_used')} {r.fired}×</div></div>
        <div className="btns" style={{ margin: 0 }}><button className="btn sm" onClick={async () => say((await supabase.from('ratifier_rules').update({ active: !r.active }).eq('id', r.id)).error)}>{r.active ? t('rat_on') : t('rat_off')}</button>
          <button className="btn ghost sm" onClick={async () => { if (confirm('?')) say((await supabase.from('ratifier_rules').delete().eq('id', r.id)).error) }}>{t('rat_del')}</button></div></div>)}
      <div className="grid2" style={{ marginTop: 10 }}><label className="f"><span>{t('rat_rule')}</span><input value={nr.rule} onChange={e => setNr({ ...nr, rule: e.target.value })} placeholder={t('rat_teach_ph')} /></label>
        <label className="f"><span>{t('rat_applies')}</span><input value={nr.applies} onChange={e => setNr({ ...nr, applies: e.target.value })} placeholder={t('rat_applies_ph')} /></label></div>
      <div className="btns" style={{ marginTop: 4 }}><button className="btn p" disabled={nr.rule.trim().length < 3} onClick={addRule}>＋ {t('rat_add')}</button></div>
    </div>
    <div className="card book" data-help="ownership"><h2 style={{ marginTop: 0 }}>🧭 {t('rat_map_title')}</h2><p className="m">{t('rat_map_hint')}</p>
      {map.map(m => <div key={m.id} className="rule-row"><div><b>{m.item}</b> <span className="pill">{depName(refd, m.department_id, lang)}</span>{m.words && <div className="m">{m.words}</div>}</div>
        <button className="btn ghost sm" onClick={async () => { if (confirm('?')) say((await supabase.from('ownership_map').delete().eq('id', m.id)).error) }}>{t('rat_del')}</button></div>)}
      <div className="grid3" style={{ marginTop: 10 }}><label className="f"><span>{t('rat_item')}</span><input value={nm.item} onChange={e => setNm({ ...nm, item: e.target.value })} placeholder={t('rat_item_ph')} /></label>
        <label className="f"><span>{t('rat_words')}</span><input value={nm.words} onChange={e => setNm({ ...nm, words: e.target.value })} placeholder={t('rat_words_ph')} /></label>
        <label className="f"><span>{t('rat_owner_dep')}</span><select value={nm.department_id} onChange={e => setNm({ ...nm, department_id: e.target.value })}><option value="">—</option>{refd.departments.map(d => <option key={d.id} value={d.id}>{d[lang === 'ar' ? 'name_ar' : 'name_en']}</option>)}</select></label></div>
      <div className="btns" style={{ marginTop: 4 }}><button className="btn p" disabled={nm.item.trim().length < 2 || !nm.department_id} onClick={addMap}>＋ {t('rat_add')}</button></div>
    </div>
  </>
}

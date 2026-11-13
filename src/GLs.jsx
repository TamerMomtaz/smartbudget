// The GLs page: every department's GL lines from finance's list, where they stand this year,
// and next year's figure (this year + 15%, 20% at the most). The director sends them, the heads review them.
import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { fmt } from './i18n'
import * as XLSX from 'xlsx'
import { Tr } from './Tr'

const r2 = (x) => Math.round(x * 100) / 100
const OPEX = ['opex_people', 'opex_training', 'opex_consumables', 'opex_maintenance', 'opex_licences', 'opex_other']
const opexYear = (a) => OPEX.reduce((s, k) => s + Number(a[k] || 0), 0)
// which GL does a card look like? shared words between the card and the GL name, Arabic or English
const words = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).map(w => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w)).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !['plant', 'lab', 'qhse', 'مصروف'].includes(w))
const TYPE_GL = { opex_maintenance: '3404002', opex_consumables: '3409007' } // the card's biggest running cost points at finance's usual GL for it
function guess(a, gls) {
  const ws = words([a.title, a.what_text].join(' ')), hit = (w) => ws.some(x => x === w || (x.length >= 4 && w.length >= 4 && (w.startsWith(x) || x.startsWith(w))))
  const best = gls.map(l => ({ l, n: words(l.name).filter(hit).length })).filter(x => x.n).sort((x, y) => y.n - x.n)[0]
  if (best) return best.l
  const top = OPEX.filter(k => Number(a[k]) > 0).sort((x, y) => Number(a[y]) - Number(a[x]))[0]
  return (TYPE_GL[top] && gls.find(l => String(l.gl_code).startsWith(TYPE_GL[top]))) || null
}
const scale = (m, k) => Array.isArray(m) && m.length === 12 ? m.map(v => r2(Number(v) * k)) : null

export default function GLs({ t, lang, profile, refd, deps, show }) {
  const next = Number(String(refd.cycle?.name || '').match(/20\d\d/)?.[0]) || new Date().getFullYear() + 1, base = next - 1
  const lead = profile.role === 'admin' || profile.role === 'director', canWrite = profile.role !== 'excom'
  const [rows, setRows] = useState([]), [asks, setAsks] = useState([]), [rate, setRate] = useState(15), [busy, setBusy] = useState(false), [open, setOpen] = useState({}), [ed, setEd] = useState({}), [dep, setDep] = useState('')
  const nm = (d) => d?.[lang === 'ar' ? 'name_ar' : 'name_en']
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('budget_lines').select('*').in('fiscal_year', [base, next]).eq('kind', 'gl').order('gl_code')
    if (error) show(error.message); else setRows(data || [])
    if (refd.cycle?.id) { const { data: as } = await supabase.from('asks').select('id,title,what_text,department_id,status,capex_amount,quote_decides,capex_class,quarter,budget_line_id,' + OPEX.join(',')).eq('cycle_id', refd.cycle.id).order('created_at'); setAsks((as || []).filter(a => !['draft', 'withdrawn'].includes(a.status))) }
  }, [base, next]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  const of = (id, y) => rows.filter(l => l.department_id === id && l.fiscal_year === y)
  const sum = (xs) => xs.reduce((s, x) => s + Number(x.amount), 0)
  // one row per GL of the department: this year's line and next year's line side by side
  const pairs = (id) => { const b = of(id, base), n = of(id, next); return [...b.map(x => ({ b: x, n: n.find(y => y.gl_code === x.gl_code) })), ...n.filter(y => !b.some(x => x.gl_code === y.gl_code)).map(y => ({ b: null, n: y }))] }
  const toSend = (id) => pairs(id).filter(p => p.b && !p.n).map(p => p.b)
  const mk = (b, pct) => ({ fiscal_year: next, department_id: b.department_id, kind: 'gl', gl_code: b.gl_code, name: b.name, amount: Math.round(Number(b.amount) * (1 + pct / 100)), last_year: Number(b.amount), monthly: scale(b.monthly, 1 + pct / 100), created_by: profile.id })
  const send = async (list) => {
    if (!list.length || busy || !confirm(`${list.length} GL → ${next} (+${rate}%) ?`)) return
    setBusy(true); const { error } = await supabase.from('budget_lines').insert(list.map(b => mk(b, rate))); setBusy(false)
    if (error) show(error.message); else { show('✓ ' + list.length + ' ' + t('gl_sent')); load() }
  }
  const saveAmt = async (n) => {
    const v = ed[n.id]; setEd(e => { const x = { ...e }; delete x[n.id]; return x }); if (v == null || v === '') return
    const a = Number(String(v).replace(/[^0-9.]/g, '')); if (!(a >= 0) || a === Number(n.amount)) return
    const { error } = await supabase.from('budget_lines').update({ amount: a, monthly: Number(n.amount) ? scale(n.monthly, a / Number(n.amount)) : n.monthly }).eq('id', n.id)
    if (error) show(error.message); else load()
  }
  const drop = async (n) => { if (!confirm(t('gl_drop_q') + '\n' + (n.gl_code || '') + ' · ' + n.name)) return; const { error } = await supabase.from('budget_lines').delete().eq('id', n.id); if (error) show(error.message); else load() }
  const move = async (p, to) => {
    const d = refd.departments.find(x => x.id === Number(to)); if (!d || !confirm(`${p.b?.name || p.n?.name}\n→ ${nm(d)} ?`)) return
    const ids = [p.b?.id, p.n?.id].filter(Boolean)
    const { error } = await supabase.from('budget_lines').update({ department_id: d.id }).in('id', ids); if (error) show(error.message); else { show('✓ → ' + nm(d)); load() }
  }
  const Pct = ({ b, n }) => { if (!b || !n || !Number(b.amount)) return null; const p = Math.round(1000 * (Number(n.amount) - Number(b.amount)) / Number(b.amount)) / 10
    return <span className={'pill ' + (p > 20 ? 'gate' : p > 15 ? 'yellow' : 'green')}>{p > 0 ? '+' : ''}{p}%</span> }
  // finance's own layout: one tab per department, Ledger account | Name | Jan..Dec | Total
  const excel = (y) => {
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], wb = XLSX.utils.book_new()
    deps.forEach(d => { const ls = of(d.id, y); if (!ls.length) return
      const rs = ls.map(l => [l.gl_code || '', l.name, ...(scale(l.monthly, 1) || Array(12).fill(null)), Number(l.amount) || 0])
      const ws = XLSX.utils.aoa_to_sheet([['Ledger account', 'Name', ...M, 'Total'], ...rs, ['Grand Total', '', ...M.map((_, i) => rs.reduce((s, r) => s + (Number(r[2 + i]) || 0), 0)), rs.reduce((s, r) => s + r[14], 0)]])
      ws['!cols'] = [{ wch: 36 }, { wch: 46 }, ...M.map(() => ({ wch: 12 })), { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, ws, String(d.name_en).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)) })
    if (!wb.SheetNames.length) { show(t('gl_none')); return }
    XLSX.writeFile(wb, `GL_${y}_by_department.xlsx`)
  }
  // the cards of a department and the GL each one belongs to
  const cardsOf = (id) => asks.filter(a => a.department_id === id)
  const glOf = (a) => rows.find(l => l.id === a.budget_line_id)
  const link = async (a, lineId) => { const { error } = await supabase.from('asks').update({ budget_line_id: lineId || null, ...(lineId ? { link_none: false } : {}) }).eq('id', a.id); if (error) show(error.message); else setAsks(xs => xs.map(x => x.id === a.id ? { ...x, budget_line_id: lineId || null } : x)) }
  // all the cards filed in one GL, and what they ask together
  const money = (a) => opexYear(a) // only the yearly cost sits in a GL; the purchase is always CAPEX
  const askedIn = (g) => asks.filter(a => { const x = glOf(a); return x && x.gl_code === g.gl_code && x.department_id === g.department_id }).reduce((s, a) => s + money(a), 0)
  const raise = async (n, v) => { if (!confirm(n.name + '\n' + fmt(n.amount) + ' → ' + fmt(v) + ' ?')) return
    const { error } = await supabase.from('budget_lines').update({ amount: v, monthly: Number(n.amount) ? scale(n.monthly, v / Number(n.amount)) : null }).eq('id', n.id); if (error) show(error.message); else load() }
  // money typed in the wrong box: a contract or yearly service is OPEX, a machine is CAPEX
  const swap = async (a) => {
    const cx = Number(a.capex_amount) || 0, ox = opexYear(a), toOpex = cx > 0 && !ox; if (!confirm(a.title + '\n' + fmt(toOpex ? cx : ox) + ' → ' + (toOpex ? 'OPEX' : 'CAPEX') + ' ?')) return
    const zero = Object.fromEntries(OPEX.map(k => [k, 0]))
    const patch = toOpex ? { ...zero, capex_amount: null, [/صيان|عقد|عقود|maint|contract/i.test(a.title) ? 'opex_maintenance' : 'opex_other']: cx } : { ...zero, capex_amount: ox }
    const { error } = await supabase.from('asks').update(patch).eq('id', a.id); if (error) show(error.message); else { setAsks(xs => xs.map(x => x.id === a.id ? { ...x, ...patch } : x)); show('✓') }
  }
  // what was promised to finance: one Excel per department, OPEX (his GLs) and CAPEX (the cards)
  // the data of one department for the Excel: its GLs (OPEX) and its cards' purchases (CAPEX)
  // the purchase of every card goes on the CAPEX tab; its yearly cost goes inside its GL, or as a new row when it has no GL
  const depData = (d) => {
    const cs = cardsOf(d.id), inGl = (code) => asks.filter(a => { const g = glOf(a); return g && g.gl_code === code && (g.department_id === d.id || a.department_id === d.id) })
    const opex = pairs(d.id).map(p => { const l = p.b || p.n; return { gl: l.gl_code || '', name: l.name, base: p.b ? Number(p.b.amount) : 0, next: p.n ? Number(p.n.amount) : null, note: p.n?.note || '', cards: inGl(l.gl_code).map(a => a.title + ' (' + fmt(opexYear(a)) + ')').join('\n') } })
    cs.filter(a => !glOf(a) && opexYear(a) > 0).forEach(a => opex.push({ gl: '', name: a.title, base: 0, next: opexYear(a), note: 'New running cost from a request, not in a ledger account yet.', cards: '' }))
    const capex = cs.filter(a => Number(a.capex_amount) > 0 || a.quote_decides).map(a => ({ title: a.title, what: a.what_text || '', cls: a.capex_class ? t('c_' + a.capex_class) : '', amount: Number(a.capex_amount) || 0, quarter: a.quarter || '', status: t(a.status), opex: opexYear(a) || null, note: a.quote_decides && !Number(a.capex_amount) ? 'No quote yet' : '' }))
    return { code: d.code || String(d.id), name: d.name_en, opex, capex }
  }
  const excelOut = async (list, file) => {
    if (busy) return; setBusy(true)
    try { const ExcelJS = (await import('exceljs')).default, { buildBook } = await import('./xl')
      const data = list.map(depData).filter(x => x.opex.length || x.capex.length); if (!data.length) { show(t('gl_none')); return }
      const wb = buildBook(ExcelJS, data, { base, next, date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), scope: 'Plant' })
      const url = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), a = document.createElement('a')
      a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) { show(String(e.message || e)) } finally { setBusy(false) }
  }
  const excelDep = (d) => excelOut([d], `Budget_${next}_${d.code || d.name_en}.xlsx`)
  const mine = deps.filter(d => of(d.id, base).length || of(d.id, next).length || cardsOf(d.id).length || profile.role === 'head')
  const seen = dep ? mine.filter(d => d.id === Number(dep)) : mine
  const waiting = mine.flatMap(d => toSend(d.id))

  return <>
    <div className="hero"><p className="k">{t('gl_kicker')}</p><h2>{t('gl_title')} {next}</h2><p className="m">{t(lead ? 'gl_hint_lead' : 'gl_hint_head')}</p>
      <div className="btns" style={{ alignItems: 'center' }}>
        {lead && <><label className="m" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{t('gl_rate')} <select value={rate} onChange={e => setRate(Number(e.target.value))}><option value={0}>0%</option><option value={15}>+15%</option><option value={20}>+20%</option></select></label>
          <button className="btn p" disabled={busy || !waiting.length} onClick={() => send(waiting)}>📤 {t('gl_send_all')} ({waiting.length})</button></>}
        {mine.length > 1 && <select value={dep} onChange={e => setDep(e.target.value)} style={{ maxWidth: 280 }}><option value="">{t('gl_all_deps')}</option>{mine.map(d => <option key={d.id} value={d.id}>{nm(d)}</option>)}</select>}
        <button className="btn p" disabled={busy} onClick={() => excelOut(seen, seen.length === 1 ? `Budget_${next}_${seen[0].code || seen[0].name_en}.xlsx` : `Budget_${next}_all_departments.xlsx`)}>📥 {t('gl_xl_all')}</button>
        <button className="btn" onClick={() => excel(next)}>📥 Excel {next}</button><button className="btn ghost" onClick={() => excel(base)}>📥 Excel {base}</button></div></div>
    {mine.length === 0 && <div className="card"><p className="m">{t('gl_none')}</p></div>}
    {seen.map(d => { const cs = cardsOf(d.id), gls = of(d.id, base).length ? of(d.id, base) : of(d.id, next); const ps = pairs(d.id), b = sum(of(d.id, base)), n = sum(of(d.id, next)), w = toSend(d.id), sent = of(d.id, next).length
      return <div key={d.id} className="card" style={{ marginTop: 12 }}>
        <div className="rh"><h2 style={{ margin: 0 }}>{nm(d)}</h2><span className={'pill ' + (sent ? 'green' : 'draft')}>{sent ? '✓ ' + t('gl_with_dep') : t('gl_not_sent')}</span></div>
        <div className="tot four"><div><span>GL</span><b>{ps.length}</b></div><div><span>{base}</span><b>{fmt(b)}</b></div><div className="o"><span>{next}</span><b>{sent ? fmt(n) : '—'}</b></div><div><span>{t('gl_change')}</span><b>{(() => { const both = ps.filter(p => p.b && p.n), bb = sum(both.map(p => p.b)), nn = sum(both.map(p => p.n)); return bb ? (nn >= bb ? '+' : '') + Math.round(1000 * (nn - bb) / bb) / 10 + '%' : '—' })()}</b></div></div>
        <div className="btns" style={{ marginTop: 8 }}><button className="btn ghost" onClick={() => setOpen({ ...open, [d.id]: !open[d.id] })}>{open[d.id] ? '▾' : '▸'} {t('gl_show')} ({ps.length})</button>
          {lead && w.length > 0 && <button className="btn y" disabled={busy} onClick={() => send(w)}>📤 {t('gl_send_dep')} +{rate}% ({w.length})</button>}
          <button className="btn" onClick={() => excelDep(d)}>📥 {t('gl_xl_dep')}</button>
          {cs.length > 0 && <span className="m">{t('gl_cards')}: {cs.filter(a => glOf(a)).length} / {cs.length} {t('gl_linked')}</span>}</div>
        {open[d.id] && <div><table className="tb gl-t" style={{ marginTop: 8 }}><thead><tr><th>GL</th><th>{base}</th><th>{next}</th><th></th></tr></thead><tbody>
          {ps.map((p, i) => { const l = p.b || p.n, n2 = p.n, can = canWrite && n2 && !n2.locked
            return <tr key={i}><td><span className="m" dir="auto">{l.gl_code}</span><div dir="auto">{l.name}</div>{(p.n?.note || l.note) && <div className={'m' + (/Above the ceiling/.test(p.n?.note || '') ? ' gate' : '')}>{p.n?.note || l.note}</div>}</td>
              <td className="m">{p.b ? fmt(p.b.amount) : '—'}</td>
              <td>{!n2 ? <span className="m">—</span> : can ? <input type="text" inputMode="decimal" style={{ width: 120 }} value={ed[n2.id] ?? String(Number(n2.amount))} onChange={e => setEd({ ...ed, [n2.id]: e.target.value })} onBlur={() => saveAmt(n2)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} /> : fmt(n2.amount)}
                {p.b && n2 && <div className="m">+15% = {fmt(Math.round(p.b.amount * 1.15))} · +20% = {fmt(Math.round(p.b.amount * 1.2))}</div>}</td>
              <td><Pct b={p.b} n={n2} /><div className="gl-act">{can && <button className="btn ghost sm" title={t('gl_drop')} onClick={() => drop(n2)}>✕ {t('gl_drop')}</button>}
                {lead && <select value="" onChange={e => e.target.value && move(p, e.target.value)} style={{ maxWidth: 150 }}><option value="">{t('gl_move')}</option>{deps.filter(x => x.id !== d.id).map(x => <option key={x.id} value={x.id}>{nm(x)}</option>)}</select>}</div></td></tr> })}
        </tbody></table></div>}
        {cs.length > 0 && <div><p className="k" style={{ marginTop: 14 }}>🃏 {t('gl_cards')}</p><p className="m">{t('gl_cards_hint')}</p>
          <table className="tb gl-t"><thead><tr><th>{t('gl_card')}</th><th>CAPEX</th><th>OPEX</th><th>GL</th></tr></thead><tbody>
            {cs.map(a => { const g = glOf(a), sg = !g && guess(a, gls), can = lead || ['draft', 'returned', 'yellow'].includes(a.status)
              return <tr key={a.id}><td><Tr text={a.title} lang={lang} /><div className="m">{t(a.status)}</div></td><td>{Number(a.capex_amount) ? fmt(a.capex_amount) : '—'}{lead && Number(a.capex_amount) > 0 && !opexYear(a) && <div><button className="btn ghost sm" onClick={() => swap(a)}>{t('gl_to_opex')} →</button></div>}</td><td>{opexYear(a) ? fmt(opexYear(a)) : '—'}{lead && opexYear(a) > 0 && !Number(a.capex_amount) && <div><button className="btn ghost sm" onClick={() => swap(a)}>← {t('gl_to_capex')}</button></div>}</td>
                <td>{can ? <select value={g?.id || ''} onChange={e => link(a, Number(e.target.value) || null)} style={{ width: '100%' }}><option value="">{t('gl_new')}</option>{g && !gls.some(l => l.id === g.id) && <option value={g.id}>{g.gl_code} · {g.name}</option>}{gls.map(l => <option key={l.id} value={l.id}>{l.gl_code} · {l.name}</option>)}</select> : <span>{g ? g.gl_code + ' · ' + g.name : t('gl_new')}</span>}
                  {g && (() => { const n27 = rows.find(l => l.fiscal_year === next && l.gl_code === g.gl_code && l.department_id === g.department_id), asked = askedIn(g)
                    return <div className="m">{t('gl_in_gl')} {next}: <b>{n27 ? fmt(n27.amount) : '—'}</b> · {t('gl_in_gl2')}: <b>{fmt(asked)}</b>
                      {n27 && asked > Number(n27.amount) ? <> <span className="pill gate">{t('gl_short')} {fmt(asked - Number(n27.amount))}</span>{lead && !n27.locked && <button className="btn ghost sm" onClick={() => raise(n27, asked)}>{t('gl_raise')} {fmt(asked)}</button>}</> : n27 ? <> <span className="pill green">✓ {t('gl_covered')}</span></> : null}</div> })()}
                  {can && sg && <div><button className="btn ghost sm" onClick={() => link(a, sg.id)}>💡 {t('gl_looks')} {sg.name} ✓</button></div>}</td></tr> })}
          </tbody></table></div>}
      </div> })}
  </>
}

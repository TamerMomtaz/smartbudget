// The GLs page: every department's GL lines from finance's list, where they stand this year,
// and next year's figure (this year + 15%, 20% at the most). The director sends them, the heads review them.
import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { fmt } from './i18n'
import * as XLSX from 'xlsx'

const r2 = (x) => Math.round(x * 100) / 100
const scale = (m, k) => Array.isArray(m) && m.length === 12 ? m.map(v => r2(Number(v) * k)) : null

export default function GLs({ t, lang, profile, refd, deps, show }) {
  const next = Number(String(refd.cycle?.name || '').match(/20\d\d/)?.[0]) || new Date().getFullYear() + 1, base = next - 1
  const lead = profile.role === 'admin' || profile.role === 'director', canWrite = profile.role !== 'excom'
  const [rows, setRows] = useState([]), [rate, setRate] = useState(15), [busy, setBusy] = useState(false), [open, setOpen] = useState({}), [ed, setEd] = useState({})
  const nm = (d) => d?.[lang === 'ar' ? 'name_ar' : 'name_en']
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('budget_lines').select('*').in('fiscal_year', [base, next]).eq('kind', 'gl').order('gl_code')
    if (error) show(error.message); else setRows(data || [])
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
  const mine = deps.filter(d => of(d.id, base).length || of(d.id, next).length || profile.role === 'head')
  const waiting = mine.flatMap(d => toSend(d.id))

  return <>
    <div className="hero"><p className="k">{t('gl_kicker')}</p><h2>{t('gl_title')} {next}</h2><p className="m">{t(lead ? 'gl_hint_lead' : 'gl_hint_head')}</p>
      <div className="btns" style={{ alignItems: 'center' }}>
        {lead && <><label className="m" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{t('gl_rate')} <select value={rate} onChange={e => setRate(Number(e.target.value))}><option value={0}>0%</option><option value={15}>+15%</option><option value={20}>+20%</option></select></label>
          <button className="btn p" disabled={busy || !waiting.length} onClick={() => send(waiting)}>📤 {t('gl_send_all')} ({waiting.length})</button></>}
        <button className="btn" onClick={() => excel(next)}>📥 Excel {next}</button><button className="btn ghost" onClick={() => excel(base)}>📥 Excel {base}</button></div></div>
    {mine.length === 0 && <div className="card"><p className="m">{t('gl_none')}</p></div>}
    {mine.map(d => { const ps = pairs(d.id), b = sum(of(d.id, base)), n = sum(of(d.id, next)), w = toSend(d.id), sent = of(d.id, next).length
      return <div key={d.id} className="card" style={{ marginTop: 12 }}>
        <div className="rh"><h2 style={{ margin: 0 }}>{nm(d)}</h2><span className={'pill ' + (sent ? 'green' : 'draft')}>{sent ? '✓ ' + t('gl_with_dep') : t('gl_not_sent')}</span></div>
        <div className="tot four"><div><span>GL</span><b>{ps.length}</b></div><div><span>{base}</span><b>{fmt(b)}</b></div><div className="o"><span>{next}</span><b>{sent ? fmt(n) : '—'}</b></div><div><span>{t('gl_change')}</span><b>{sent && b ? (n >= b ? '+' : '') + Math.round(1000 * (n - b) / b) / 10 + '%' : '—'}</b></div></div>
        <div className="btns" style={{ marginTop: 8 }}><button className="btn ghost" onClick={() => setOpen({ ...open, [d.id]: !open[d.id] })}>{open[d.id] ? '▾' : '▸'} {t('gl_show')} ({ps.length})</button>
          {lead && w.length > 0 && <button className="btn y" disabled={busy} onClick={() => send(w)}>📤 {t('gl_send_dep')} +{rate}% ({w.length})</button>}</div>
        {open[d.id] && <div style={{ overflowX: 'auto' }}><table className="tb" style={{ marginTop: 8 }}><thead><tr><th>GL</th><th>{base}</th><th>{next}</th><th></th><th></th></tr></thead><tbody>
          {ps.map((p, i) => { const l = p.b || p.n, n2 = p.n, can = canWrite && n2 && !n2.locked
            return <tr key={i}><td><span className="m">{l.gl_code}</span><div>{l.name}</div>{l.note && <div className="m">{l.note}</div>}</td>
              <td className="m">{p.b ? fmt(p.b.amount) : '—'}</td>
              <td>{!n2 ? <span className="m">—</span> : can ? <input type="text" inputMode="decimal" style={{ width: 120 }} value={ed[n2.id] ?? String(Number(n2.amount))} onChange={e => setEd({ ...ed, [n2.id]: e.target.value })} onBlur={() => saveAmt(n2)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} /> : fmt(n2.amount)}
                {p.b && n2 && <div className="m">+15% = {fmt(Math.round(p.b.amount * 1.15))} · +20% = {fmt(Math.round(p.b.amount * 1.2))}</div>}</td>
              <td><Pct b={p.b} n={n2} /></td>
              <td style={{ whiteSpace: 'nowrap' }}>{can && <button className="btn ghost sm" title={t('gl_drop')} onClick={() => drop(n2)}>✕ {t('gl_drop')}</button>}
                {lead && <select value="" onChange={e => e.target.value && move(p, e.target.value)} style={{ maxWidth: 150 }}><option value="">{t('gl_move')}</option>{deps.filter(x => x.id !== d.id).map(x => <option key={x.id} value={x.id}>{nm(x)}</option>)}</select>}</td></tr> })}
        </tbody></table></div>}
      </div> })}
  </>
}

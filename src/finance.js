// Reads finance's own Excel files as they send them, every tab.
// Seen so far (2026-11 samples): YTD "Budget owner | Ledger account | Name | Actual | Budget 2026 | Remaining | %",
// the same without "Budget owner" (Lab), a monthly OPEX plan (Jan..Dec), a CAPEX list (القسم | البند | Items | القيمة | النوع)
// and breakdown tabs per GL (المورد | بيان | القيمة | العدد | الإجمالى, with a year per column).
// Headers start on different rows and are sometimes shifted, so the GL is found by its shape (7 digits + cost centre).
import * as XLSX from 'xlsx'

export const GLRX = /^\s*(\d{6,8})\s*-\s*(\S.*?)\s*$/
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const AR_DIG = '٠١٢٣٤٥٦٧٨٩'
const num = (v) => { if (typeof v === 'number') return v; const n = Number(String(v ?? '').replace(/[٠-٩]/g, d => AR_DIG.indexOf(d)).replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : 0 }
const r2 = (n) => Math.round(n * 100) / 100
const low = (v) => String(v ?? '').trim().toLowerCase()
const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

function headerRow(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 12); i++) {
    const c = aoa[i].map(low)
    if (c.includes('name') && (c.some(x => x === 'actual' || x.startsWith('budget') || x === 'jan'))) return { i, type: 'gl' }
    if (c.some(x => x.includes('القيمة')) && c.some(x => x.includes('البند') || x === 'items')) return { i, type: 'capex' }
  }
  return null
}
const yearIn = (s) => { const m = String(s ?? '').match(/(?:^|\D)(20\d\d)(?!\d)/); return m ? Number(m[1]) : null }

export function readWorkbook(buf, fileName = '') {
  const wb = XLSX.read(buf)
  const fileYear = yearIn(fileName)
  const sheets = []
  for (const name of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true })
    const h = headerRow(aoa)
    const titleYear = aoa.slice(0, 2).flat().map(yearIn).find(Boolean)
    if (h?.type === 'gl') {
      const H = aoa[h.i].map(low), at = (f) => H.findIndex(f)
      const iOwner = at(x => x.startsWith('budget owner')), iName = at(x => x === 'name'), iAct = at(x => x === 'actual')
      const iBud = at(x => /^budget\b/.test(x) && x !== 'budget owner'), iMon = MONTHS.map(m => H.indexOf(m))
      const year = yearIn(aoa[h.i][iBud]) || titleYear || fileYear || yearIn(name)
      // finance's multi-tab files carry no "Budget owner" column: the tab itself is the owner (Lab, Maintenance, Production, QHSE, Admin),
      // and the cost centre after the GL code can be another department's (the Maintenance tab holds "3404002-الإنتاج")
      const tabOwner = iOwner < 0 && !/^(sheet|ورقة)\s*\d*$/i.test(txt(name)) ? txt(name) : ''
      const lines = []
      for (const row of aoa.slice(h.i + 1)) {
        const gi = row.findIndex(v => GLRX.test(String(v)))
        if (gi < 0) continue // totals and blank rows
        const [, code, cc] = String(row[gi]).match(GLRX)
        const monthly = iMon.every(x => x >= 0) ? iMon.map(x => r2(num(row[x]))) : null
        const budget = iBud >= 0 ? r2(num(row[iBud])) : monthly ? r2(monthly.reduce((s, x) => s + x, 0)) : 0
        lines.push({ kind: 'gl', gl: `${code}-${txt(cc)}`, code, cc: txt(cc), owner: (iOwner >= 0 && txt(row[iOwner])) || tabOwner || txt(cc), ownerSet: iOwner >= 0 && !!txt(row[iOwner]), name: txt(row[iName]), budget, actual: iAct >= 0 ? r2(num(row[iAct])) : null, monthly })
      }
      // rows with the owner left blank belong to the sheet's usual owner (the plan tab leaves it empty after row 4)
      if (iOwner >= 0) { const cnt = {}; lines.forEach(l => { if (l.ownerSet) cnt[l.owner] = (cnt[l.owner] || 0) + 1 }); const top = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0]; if (top) lines.forEach(l => { if (!l.ownerSet) l.owner = top }) }
      lines.forEach(l => delete l.ownerSet)
      sheets.push({ name, type: iAct >= 0 ? 'ytd' : 'plan', year, lines })
    } else if (h?.type === 'capex') {
      const H = aoa[h.i].map(low), at = (f) => H.findIndex(f)
      const iDep = at(x => x.includes('القسم') || x === 'department'), iAr = at(x => x.includes('البند')), iEn = at(x => x === 'items'), iVal = at(x => x.includes('القيمة')), iType = at(x => x.includes('النوع') || x === 'type')
      const lines = aoa.slice(h.i + 1).filter(r => num(r[iVal]) > 0).map(r => ({ kind: 'capex', gl: null, owner: txt(r[iDep]), name: txt(r[iAr]) || txt(r[iEn]), note: [txt(r[iEn]), txt(r[iType])].filter(Boolean).join(' · '), budget: r2(num(r[iVal])), actual: null, monthly: null }))
      sheets.push({ name, type: 'capex', year: titleYear || fileYear, lines })
    } else {
      // breakdown blocks: a GL row, then "المورد | بيان | القيمة | العدد | الإجمالى", then items; columns can carry a year (2025 / 2026)
      const yearCols = {}
      aoa.slice(0, 4).forEach(r => r.forEach((v, j) => { if (typeof v === 'number' && v >= 2020 && v <= 2040) yearCols[j] = v }))
      const blocks = []; let cur = null, cols = null
      for (const row of aoa) {
        const gi = row.findIndex(v => GLRX.test(String(v)))
        if (gi >= 0) { const [, code, cc] = String(row[gi]).match(GLRX); cur = { gl: `${code}-${txt(cc)}`, name: txt(row[gi + 1]), items: [] }; blocks.push(cur); cols = null; continue }
        if (!cur) continue
        const L = row.map(low)
        if (L.some(x => x === 'المورد' || x === 'بيان')) { cols = { v: L.indexOf('المورد'), d: L.indexOf('بيان'), p: L.indexOf('القيمة'), n: L.indexOf('العدد') }; continue }
        if (!cols) continue
        const vendor = txt(row[cols.v]), item = txt(row[cols.d])
        if (!vendor && !item) continue // subtotals
        if (!vendor && /-[A-Za-z]+$/.test(item)) continue // another line's name ("مصروف مياه-Plant"), not an item of this one
        const by = {}; Object.entries(yearCols).forEach(([j, y]) => { const n = num(row[j]); if (n) by[y] = r2(n) })
        // no year columns: the "total" column is the one after the count
        if (!Object.keys(by).length && cols.n >= 0 && num(row[cols.n + 1])) by[yearIn(fileName) || 'total'] = r2(num(row[cols.n + 1]))
        cur.items.push({ vendor, item, price: num(row[cols.p]) || null, count: num(row[cols.n]) || null, by })
      }
      const kept = blocks.filter(b => b.items.length)
      sheets.push({ name, type: kept.length ? 'detail' : 'skip', year: fileYear || Math.max(0, ...Object.values(yearCols)) || titleYear, yearCols: Object.values(yearCols), blocks: kept })
    }
  }
  return { fileName, sheets }
}

// what a person would want pointed out before importing
export function notice(book) {
  const out = []
  for (const s of book.sheets) for (const l of s.lines || []) {
    if (s.type !== 'ytd') continue
    if (l.budget > 0 && l.actual > l.budget) out.push({ k: 'over', s: s.name, l, pct: Math.round(100 * l.actual / l.budget) })
    else if (!l.budget && l.actual > 0) out.push({ k: 'nobudget', s: s.name, l })
  }
  // the monthly plan and a YTD tab in the same file should agree on each line's budget
  const plan = book.sheets.find(s => s.type === 'plan'), ytd = book.sheets.filter(s => s.type === 'ytd' && plan && s.year === plan.year)
  if (plan) for (const y of ytd) for (const p of plan.lines) { const m = y.lines.find(x => x.gl === p.gl); if (m && Math.abs(m.budget - p.budget) > 1) out.push({ k: 'diff', s: plan.name, l: p, other: m.budget }) }
  return out
}

// detail blocks attach to the line with the same GL, nearest year
export const planToDate = (monthly, year, now = new Date()) => {
  if (!Array.isArray(monthly)) return null
  const upto = year < now.getFullYear() ? 12 : year > now.getFullYear() ? 0 : now.getMonth() + 1
  return r2(monthly.slice(0, upto).reduce((s, x) => s + Number(x || 0), 0))
}

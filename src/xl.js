// The Excel that goes to finance: one clean workbook, laid out the way a finance team reads it.
// Pure builder: it gets plain data and an ExcelJS class, and returns a workbook. No database here.
const NAVY = 'FF0F2A43', GOLD = 'FFC9A227', PALE = 'FFF3F6F9', LINE = 'FFD5DCE3', RED = 'FFB42318', AMBER = 'FF9A6700', GREY = 'FF5B6B7A'
const NUM = '#,##0;[Red]-#,##0;"-"', PCT = '+0.0%;[Red]-0.0%;"-"'
const thin = { style: 'thin', color: { argb: LINE } }
const box = { top: thin, bottom: thin, left: thin, right: thin }
const pct = (b, n) => (b > 0 && n != null ? (n - b) / b : null)

function title(ws, text, sub, cols) {
  ws.mergeCells(1, 1, 1, cols); ws.mergeCells(2, 1, 2, cols)
  const a = ws.getCell(1, 1); a.value = text; a.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }; a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; a.alignment = { vertical: 'middle', indent: 1 }
  const b = ws.getCell(2, 1); b.value = sub; b.font = { name: 'Calibri', size: 10, color: { argb: GREY } }; b.alignment = { vertical: 'middle', indent: 1 }; b.border = { bottom: { style: 'medium', color: { argb: GOLD } } }
  ws.getRow(1).height = 30; ws.getRow(2).height = 20
}
function head(ws, r, labels) {
  const row = ws.getRow(r); row.height = 24
  labels.forEach((l, i) => { const c = row.getCell(i + 1); c.value = l; c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = box })
}
function body(ws, r, vals, fmts, i) {
  const row = ws.getRow(r)
  vals.forEach((v, k) => { const c = row.getCell(k + 1); c.value = v ?? null; c.font = { name: 'Calibri', size: 11 }; c.border = box; c.alignment = { vertical: 'top', wrapText: true, horizontal: fmts[k] ? 'right' : undefined, readingOrder: undefined }
    if (fmts[k]) c.numFmt = fmts[k]; if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE } } })
  return row
}
function total(ws, r, vals, fmts) {
  const row = ws.getRow(r); row.height = 22
  vals.forEach((v, k) => { const c = row.getCell(k + 1); c.value = v ?? null; c.font = { name: 'Calibri', size: 11, bold: true }; c.border = { top: { style: 'medium', color: { argb: NAVY } }, bottom: { style: 'double', color: { argb: NAVY } }, left: thin, right: thin }; c.alignment = { vertical: 'middle', horizontal: fmts[k] ? 'right' : undefined }; if (fmts[k]) c.numFmt = fmts[k] })
}
function page(ws, headRow) {
  ws.views = [{ state: 'frozen', ySplit: headRow, showGridLines: false }]
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  ws.pageSetup.printTitlesRow = headRow + ':' + headRow
  ws.headerFooter = { oddFooter: '&L&8Al Manar · Budget · prepared in smartBudget&R&8Page &P of &N' }
}
const sums = (d) => { const b = d.opex.reduce((s, r) => s + (r.base || 0), 0), n = d.opex.reduce((s, r) => s + (r.next || 0), 0), f = (d.fresh || []).reduce((s, r) => s + (r.next || 0), 0), c = d.capex.reduce((s, r) => s + (r.amount || 0), 0), v = d.opex.reduce((s, r) => s + (r.over || 0), 0); return { b, n, f, c, v } }
const tab = (s) => String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)

function opexSheet(wb, d, o, name) {
  const ws = wb.addWorksheet(tab(name), { properties: { tabColor: { argb: NAVY } } })
  ws.columns = [{ width: 6 }, { width: 22 }, { width: 44 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 44 }, { width: 52 }]
  title(ws, `${d.name} · OPEX ${o.next}`, `${d.opex.length ? 'Running costs by ledger account' : 'Running costs of the projects'} · ${o.base} against ${o.next} · finance's rule: +15% for inflation, +20% at the most · EGP · ${o.date}`, 8)
  const F = [null, null, null, NUM, NUM, PCT, null, null]
  if (d.opex.length) head(ws, 4, ['#', 'Ledger account', 'Name', String(o.base), String(o.next), 'Change', 'Requests inside this account', 'Note'])
  d.opex.forEach((r, i) => { const p = pct(r.base, r.next), row = body(ws, 5 + i, [i + 1, r.gl || 'New', r.name, r.base || 0, r.next ?? 0, p, r.cards || '', r.note || ''], F, i)
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' }
    if (p != null && p > 0.2001) { row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: RED } }; row.getCell(5).font = { name: 'Calibri', size: 11, bold: true, color: { argb: RED } } } else if (p != null && p > 0.1501) row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: AMBER } }
    if ((r.base || 0) < 1000 && r.next) { row.getCell(6).value = 'New'; row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: AMBER } }; row.getCell(5).font = { name: 'Calibri', size: 11 } } })
  const s = sums(d); let tr = d.opex.length ? 5 + d.opex.length : 1
  if (d.opex.length) total(ws, tr, ['', 'Total of ledger accounts', '', s.b, s.n, pct(s.b, s.n), '', ''], F)
  if ((d.fresh || []).length) {
    const h = ws.getCell(tr + 2, 2); h.value = d.opex.length ? 'New running costs asked in requests (not in any ledger account, shown apart and not counted in the change above)' : 'Running costs that come with the projects on the CAPEX tab'; h.font = { name: 'Calibri', size: 11, bold: true, color: { argb: NAVY } }
    head(ws, tr + 3, ['#', '', 'Request', '', String(o.next), '', '', 'Note'])
    d.fresh.forEach((r, i) => { const row = body(ws, tr + 4 + i, [i + 1, '', r.name, null, r.next, null, '', r.note || ''], F, i); row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' } })
    total(ws, tr + 4 + d.fresh.length, ['', 'Total of new running costs', '', null, s.f, null, '', ''], F)
    tr = tr + 4 + d.fresh.length
  }
  if (!d.opex.length) { page(ws, 4); return ws }
  const k = ws.getCell(tr + 2, 2); k.value = 'Red = above +20%, needs approval.  Amber = between +15% and +20%.  New = almost no spending on this account in ' + o.base + ', so there is no base to compare.'; k.font = { name: 'Calibri', size: 9, italic: true, color: { argb: GREY } }
  page(ws, 4); return ws
}
function capexSheet(wb, d, o, name) {
  const ws = wb.addWorksheet(tab(name), { properties: { tabColor: { argb: GOLD } } })
  ws.columns = [{ width: 6 }, { width: 46 }, { width: 60 }, { width: 14 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 30 }]
  title(ws, `${d.name} · CAPEX ${o.next}`, `New purchases and projects asked for ${o.next} · EGP · ${o.date}`, 9)
  head(ws, 4, ['#', 'Item', 'What it is for', 'Type', 'Amount', 'Quarter', 'Status', 'Running cost / year', 'Note'])
  const F = [null, null, null, null, NUM, null, null, NUM, null]
  const rows = [...d.capex].sort((a, b) => (b.amount || 0) - (a.amount || 0))
  rows.forEach((r, i) => { const row = body(ws, 5 + i, [i + 1, r.title, r.what || '', r.cls || '', r.amount || 0, r.quarter || '', r.status || '', r.opex || null, r.note || ''], F, i); row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' }; row.getCell(6).alignment = { vertical: 'top', horizontal: 'center' } })
  total(ws, 5 + rows.length, ['', 'Total', '', '', rows.reduce((s, r) => s + (r.amount || 0), 0), '', '', rows.reduce((s, r) => s + (r.opex || 0), 0) || null, ''], F)
  if (!rows.length) { const c = ws.getCell(5, 2); c.value = 'No CAPEX asked.'; c.font = { name: 'Calibri', size: 11, italic: true, color: { argb: GREY } } }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 9 } }
  page(ws, 4); return ws
}
function summarySheet(wb, deps, o, heading) {
  const ws = wb.addWorksheet('Summary', { properties: { tabColor: { argb: GOLD } } })
  ws.columns = [{ width: 6 }, { width: 44 }, { width: 18 }, { width: 18 }, { width: 12 }, { width: 22 }, { width: 22 }, { width: 18 }]
  title(ws, heading, `Summary · running costs ${o.base} against ${o.next}, and what is asked for ${o.next} · EGP · ${o.date}`, 8)
  const F = [null, null, NUM, NUM, PCT, NUM, NUM, NUM], normal = deps.filter(d => !d.strategic), strat = deps.filter(d => d.strategic)
  let r = 4
  if (normal.length) {
    head(ws, r, ['#', normal.length > 1 ? 'Department' : 'Section', 'OPEX ' + o.base, 'OPEX ' + o.next, 'Change', 'Requests above the accounts', 'New running costs asked', 'CAPEX asked ' + o.next])
    let B = 0, N = 0, Fr = 0, C = 0, V = 0
    normal.forEach((d, i) => { const s = sums(d); B += s.b; N += s.n; Fr += s.f; C += s.c; V += s.v; const row = body(ws, r + 1 + i, [i + 1, d.name, s.b, s.n, pct(s.b, s.n), s.v || null, s.f || null, s.c || null], F, i); row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' } })
    r = r + 1 + normal.length; total(ws, r, ['', 'Total', B, N, pct(B, N), V || null, Fr || null, C || null], F); r += 2
  }
  if (strat.length) {
    const h = ws.getCell(r, 2); ws.mergeCells(r, 2, r, 8); h.value = "Strategic direction: large one-off projects, shown apart and decided separately. Not part of the departments' budgets above."; h.font = { name: 'Calibri', size: 11, bold: true, color: { argb: NAVY } }
    head(ws, r + 1, ['#', 'Strategic project', '', '', '', 'Quarter', 'Running cost / year', 'CAPEX asked ' + o.next])
    const items = strat.flatMap(d => d.capex).sort((a, b) => (b.amount || 0) - (a.amount || 0)), SF = [null, null, null, null, null, null, NUM, NUM]
    items.forEach((x, i) => { const row = body(ws, r + 2 + i, [i + 1, x.title, null, null, null, x.quarter || '', x.opex || null, x.amount || 0], SF, i); ws.mergeCells(r + 2 + i, 2, r + 2 + i, 5); row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' }; row.getCell(6).alignment = { vertical: 'top', horizontal: 'center' } })
    r = r + 2 + items.length; total(ws, r, ['', 'Total strategic', '', '', '', '', items.reduce((s, x) => s + (x.opex || 0), 0) || null, items.reduce((s, x) => s + (x.amount || 0), 0)], SF); r += 2
  }
  const notes = ['How to read this file', "• OPEX: one row per ledger account, as in finance's own sheet, with " + o.base + ' beside ' + o.next + '. The change compares the same accounts in both years.', "• Finance's rule: +15% for inflation, +20% at the most. Anything above is shown in red and needs approval.", '• Requests above the accounts: what the departments ask for inside existing ledger accounts beyond the ' + o.next + " figure. The account is kept at finance's rule and the extra is shown here, with the request named on the department's OPEX tab.", '• New running costs asked: yearly costs requested for ' + o.next + " that are not in any ledger account yet. They are listed apart, under each department's OPEX tab.", '• CAPEX: every new purchase or project, largest first, with its yearly running cost if it has one.', "• Strategic projects are listed apart and are not added to the departments' totals."]
  notes.forEach((x, i) => { const c = ws.getCell(r + i, 2); ws.mergeCells(r + i, 2, r + i, 8); c.value = x; c.alignment = { wrapText: true, vertical: 'top' }; if (x.length > 150) ws.getRow(r + i).height = 28; c.font = { name: 'Calibri', size: i ? 10 : 11, bold: !i, color: { argb: i ? GREY : NAVY } } })
  page(ws, 4); return ws
}

// a band across the table that names the department the rows below belong to
function band(ws, r, text, cols) {
  ws.mergeCells(r, 1, r, cols); const c = ws.getCell(r, 1); c.value = text; c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: NAVY } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EAF1' } }; c.alignment = { vertical: 'middle', indent: 1 }; c.border = box; ws.getRow(r).height = 20
}
function sub(ws, r, vals, fmts) {
  const row = ws.getRow(r)
  vals.forEach((v, k) => { const c = row.getCell(k + 1); c.value = v ?? null; c.font = { name: 'Calibri', size: 11, bold: true }; c.border = { top: thin, bottom: { style: 'thin', color: { argb: NAVY } }, left: thin, right: thin }; c.alignment = { vertical: 'middle', horizontal: fmts[k] ? 'right' : undefined }; if (fmts[k]) c.numFmt = fmts[k] })
}
const label = (d) => d.name + (d.head ? '  ·  ' + d.head : '')
// every ledger account of every department on one sheet, the way finance keeps its own sheet
function allOpexSheet(wb, deps, o) {
  const ws = wb.addWorksheet('All accounts', { properties: { tabColor: { argb: NAVY } } })
  ws.columns = [{ width: 6 }, { width: 24 }, { width: 46 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 18 }, { width: 50 }]
  title(ws, `${o.scope || 'Plant'} · all ledger accounts on one page · OPEX ${o.next}`, `Every account of finance's ${o.base} sheet, grouped by its budget owner · ${o.base} against ${o.next} · EGP · ${o.date}`, 8)
  head(ws, 4, ['#', 'Ledger account', 'Name', String(o.base), String(o.next), 'Change', 'Requests above the account', 'Requests inside this account'])
  const F = [null, null, null, NUM, NUM, PCT, NUM, null]
  let r = 5, n = 0, B = 0, N = 0, V = 0
  deps.filter(d => !d.strategic && d.opex.length).forEach(d => {
    band(ws, r++, label(d), 8)
    d.opex.forEach((x, i) => { const p = pct(x.base, x.next), row = body(ws, r++, [++n, x.gl || '', x.name, x.base || 0, x.next ?? 0, p, x.over || null, x.cards || ''], F, i); row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' }
      if (p != null && p > 0.2001) row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: RED } }; else if (p != null && p > 0.1501) row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: AMBER } }
      if ((x.base || 0) < 1000 && x.next) { row.getCell(6).value = 'New'; row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: AMBER } } } })
    const s = sums(d); B += s.b; N += s.n; V += s.v
    sub(ws, r++, ['', 'Total ' + d.name, '', s.b, s.n, pct(s.b, s.n), s.v || null, ''], F); r++
  })
  total(ws, r, ['', 'Total ' + (o.scope || 'Plant'), '', B, N, pct(B, N), V || null, ''], F)
  const k = ws.getCell(r + 2, 2); k.value = 'Red = above +20%.  Amber = between +15% and +20%.  New = almost no spending on this account in ' + o.base + '.  Requests above the account = asked by the department beyond the ' + o.next + ' figure, shown apart.'; k.font = { name: 'Calibri', size: 9, italic: true, color: { argb: GREY } }
  page(ws, 4); return ws
}
function allCapexSheet(wb, deps, o) {
  const ws = wb.addWorksheet('All CAPEX', { properties: { tabColor: { argb: GOLD } } })
  ws.columns = [{ width: 6 }, { width: 52 }, { width: 60 }, { width: 14 }, { width: 16 }, { width: 10 }, { width: 16 }]
  title(ws, `${o.scope || 'Plant'} · all CAPEX on one page · ${o.next}`, `Every new purchase and project asked for ${o.next}, grouped by department, largest first · EGP · ${o.date}`, 7)
  head(ws, 4, ['#', 'Item', 'What it is for', 'Type', 'Amount', 'Quarter', 'Running cost / year'])
  const F = [null, null, null, null, NUM, null, NUM]
  let r = 5, n = 0
  const group = (list, name) => { let C = 0, O = 0
    list.filter(d => d.capex.length).forEach(d => { band(ws, r++, label(d), 7)
      const rows = [...d.capex].sort((a, b) => (b.amount || 0) - (a.amount || 0)); let c = 0, ox = 0
      rows.forEach((x, i) => { c += x.amount || 0; ox += x.opex || 0; const row = body(ws, r++, [++n, x.title, x.what || '', x.cls || '', x.amount || 0, x.quarter || '', x.opex || null], F, i); row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' }; row.getCell(6).alignment = { vertical: 'top', horizontal: 'center' } })
      C += c; O += ox; sub(ws, r++, ['', 'Total ' + d.name, '', '', c, '', ox || null], F); r++ })
    total(ws, r, ['', name, '', '', C, '', O || null], F); r += 2 }
  group(deps.filter(d => !d.strategic), 'Total departments')
  if (deps.some(d => d.strategic && d.capex.length)) group(deps.filter(d => d.strategic), 'Total strategic projects (decided separately, not added to the departments)')
  page(ws, 4); return ws
}
// the page that makes the file readable without anyone explaining it
function guideSheet(wb, deps, o) {
  const ws = wb.addWorksheet('Guide', { properties: { tabColor: { argb: GREY } } })
  ws.columns = [{ width: 6 }, { width: 14 }, { width: 40 }, { width: 28 }, { width: 80 }]
  title(ws, `${o.scope || 'Plant'} · Budget ${o.next} · guide to this file`, `Who owns what, what is different from finance's ${o.base} sheet, and how to read the tabs · ${o.date}`, 5)
  let r = 4
  const h = (t) => { const c = ws.getCell(r, 2); ws.mergeCells(r, 2, r, 5); c.value = t; c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: NAVY } }; c.border = { bottom: { style: 'medium', color: { argb: GOLD } } }; ws.getRow(r).height = 22; r++ }
  const line = (t) => { const c = ws.getCell(r, 2); ws.mergeCells(r, 2, r, 5); c.value = t; c.font = { name: 'Calibri', size: 11 }; c.alignment = { wrapText: true, vertical: 'top' }; ws.getRow(r).height = Math.max(16, Math.ceil(t.length / 150) * 15.5); r++ }
  h('1. Budget owners'); head(ws, r, ['#', 'Code', 'Department (cost centre)', 'Budget owner', 'What it covers']); r++
  deps.forEach((d, i) => { const row = body(ws, r++, [i + 1, d.code, d.name, d.head || '', d.does || ''], [null, null, null, null, null], i); row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' }; row.getCell(2).font = { name: 'Calibri', size: 11, bold: true } })
  r++
  if ((o.changes || []).length) { h("2. What is different from finance's " + o.base + ' sheet'); o.changes.forEach(x => line('• ' + x)); r++ }
  h(((o.changes || []).length ? '3' : '2') + '. How the file is organised')
  ;['Summary: one row per department, with the totals. Start here.', "All accounts: every ledger account of all departments on one page, grouped by budget owner. This is the page to set beside finance's own sheet.", 'All CAPEX: every purchase and project of all departments on one page.', 'Then two tabs per department, named with its code: "' + (deps[0]?.code || 'XXX') + ' OPEX" (its ledger accounts and the requests inside them) and "' + (deps[0]?.code || 'XXX') + ' CAPEX" (its purchases and projects, with what each is for).'].forEach(x => line('• ' + x)); r++
  h(((o.changes || []).length ? '4' : '3') + '. Words used')
  ;['OPEX: yearly running costs, by ledger account, ' + o.base + ' beside ' + o.next + '.', 'CAPEX: new purchases and projects asked for ' + o.next + '.', "Change: " + o.next + ' against ' + o.base + " for the same account. Finance's rule: +15% for inflation, +20% at the most. Amber = between 15% and 20%. Red = above 20%. New = almost nothing was spent on the account in " + o.base + '.', 'Requests above the accounts: what a department asks for inside an existing account beyond its ' + o.next + ' figure. The account is kept at the rule and the extra is shown apart, with the request named.', 'New running costs asked: yearly costs that are not in any ledger account yet.', 'Strategic projects: large one-off projects, listed apart and decided separately.', ...(o.words || [])].forEach(x => line('• ' + x))
  ws.views = [{ showGridLines: false }]; ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  ws.headerFooter = { oddFooter: '&L&8Al Manar · Budget · prepared in smartBudget&R&8Page &P of &N' }
  return ws
}
// deps: [{ code, name, head, does, strategic, opex: [{ gl, name, base, next, note, cards }], fresh: [{ name, next, note }], capex: [{ title, what, cls, amount, quarter, status, opex, note }] }]
export function buildBook(ExcelJS, deps, o) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'smartBudget'; wb.created = new Date()
  const one = deps.length === 1, ordered = [...deps.filter(d => !d.strategic), ...deps.filter(d => d.strategic)]
  summarySheet(wb, ordered, o, one ? `${deps[0].name} · Budget ${o.next}` : `${o.scope || 'Plant'} · Budget ${o.next}`)
  if (!one) { guideSheet(wb, ordered, o); allOpexSheet(wb, ordered, o); allCapexSheet(wb, ordered, o) }
  ordered.forEach(d => { if (d.opex.length || (d.fresh || []).length) opexSheet(wb, d, o, one ? 'OPEX ' + o.next : d.code + ' OPEX'); capexSheet(wb, d, o, one ? 'CAPEX ' + o.next : d.code + ' CAPEX') })
  return wb
}

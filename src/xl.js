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
const sums = (d) => { const b = d.opex.reduce((s, r) => s + (r.base || 0), 0), n = d.opex.reduce((s, r) => s + (r.next || 0), 0), c = d.capex.reduce((s, r) => s + (r.amount || 0), 0); return { b, n, c } }
const tab = (s) => String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)

function opexSheet(wb, d, o, name) {
  const ws = wb.addWorksheet(tab(name), { properties: { tabColor: { argb: NAVY } } })
  ws.columns = [{ width: 6 }, { width: 22 }, { width: 44 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 44 }, { width: 52 }]
  title(ws, `${d.name} · OPEX ${o.next}`, `Running costs by ledger account · ${o.base} against ${o.next} · finance's rule: +15% for inflation, +20% at the most · EGP · ${o.date}`, 8)
  head(ws, 4, ['#', 'Ledger account', 'Name', String(o.base), String(o.next), 'Change', 'Requests inside this account', 'Note'])
  const F = [null, null, null, NUM, NUM, PCT, null, null]
  d.opex.forEach((r, i) => { const p = pct(r.base, r.next), row = body(ws, 5 + i, [i + 1, r.gl || 'New', r.name, r.base || 0, r.next ?? 0, p, r.cards || '', r.note || ''], F, i)
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' }
    if (p != null && p > 0.2001) { row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: RED } }; row.getCell(5).font = { name: 'Calibri', size: 11, bold: true, color: { argb: RED } } } else if (p != null && p > 0.1501) row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: AMBER } }
    if ((r.base || 0) < 1000 && r.next) { row.getCell(6).value = 'New'; row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: AMBER } }; row.getCell(5).font = { name: 'Calibri', size: 11 } } })
  const s = sums(d), tr = 5 + d.opex.length
  total(ws, tr, ['', 'Total', '', s.b, s.n, pct(s.b, s.n), '', ''], F)
  const k = ws.getCell(tr + 2, 2); k.value = 'Red = above +20%, needs approval.  Amber = between +15% and +20%.  New = almost no spending on this account in ' + o.base + ', so there is no base to compare.'; k.font = { name: 'Calibri', size: 9, italic: true, color: { argb: GREY } }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 8 } }
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
  ws.columns = [{ width: 6 }, { width: 44 }, { width: 18 }, { width: 18 }, { width: 12 }, { width: 18 }, { width: 20 }]
  title(ws, heading, `Summary · OPEX ${o.base} against ${o.next}, and CAPEX asked for ${o.next} · EGP · ${o.date}`, 7)
  head(ws, 4, ['#', deps.length > 1 ? 'Department' : 'Section', 'OPEX ' + o.base, 'OPEX ' + o.next, 'Change', 'CAPEX ' + o.next, 'Total asked ' + o.next])
  const F = [null, null, NUM, NUM, PCT, NUM, NUM]; let B = 0, N = 0, C = 0
  deps.forEach((d, i) => { const s = sums(d); B += s.b; N += s.n; C += s.c; const row = body(ws, 5 + i, [i + 1, d.name, s.b, s.n, pct(s.b, s.n), s.c, s.n + s.c], F, i); row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' } })
  total(ws, 5 + deps.length, ['', 'Total', B, N, pct(B, N), C, N + C], F)
  const notes = ['How to read this file', '• OPEX: one row per ledger account, as in finance\'s own sheet, with ' + o.base + ' beside ' + o.next + '.', '• Finance\'s rule: +15% for inflation, +20% at the most. Anything above is shown in red and needs approval.', '• CAPEX: every new purchase or project, largest first, with its yearly running cost if it has one.', '• Each department has two tabs: OPEX and CAPEX.']
  notes.forEach((x, i) => { const c = ws.getCell(8 + deps.length + i, 2); ws.mergeCells(8 + deps.length + i, 2, 8 + deps.length + i, 7); c.value = x; c.font = { name: 'Calibri', size: i ? 10 : 11, bold: !i, color: { argb: i ? GREY : NAVY } } })
  page(ws, 4); return ws
}
// deps: [{ code, name, opex: [{ gl, name, base, next, note, cards }], capex: [{ title, what, cls, amount, quarter, status, opex, note }] }]
export function buildBook(ExcelJS, deps, o) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'smartBudget'; wb.created = new Date()
  const one = deps.length === 1
  summarySheet(wb, deps, o, one ? `${deps[0].name} · Budget ${o.next}` : `${o.scope || 'Plant'} · Budget ${o.next}`)
  deps.forEach(d => { opexSheet(wb, d, o, one ? 'OPEX ' + o.next : d.code + ' OPEX'); capexSheet(wb, d, o, one ? 'CAPEX ' + o.next : d.code + ' CAPEX') })
  return wb
}

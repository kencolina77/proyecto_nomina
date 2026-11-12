import { useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleAlert,
  CirclePlus,
  ClipboardList,
  FileDown,
  FileSpreadsheet,
  HardDrive,
  Pencil,
  Save,
  Trash2,
  LockKeyhole,
  Search,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import {
  exportEditedWorkbook,
  formatCellValue,
  isDatePayrollField,
  isNumericPayrollField,
  loadPayrollWorkbook,
  normalizeText,
  parsePayrollCellEdit,
  type CellValue,
  type PayrollRecord,
  type PayrollSheet,
  type PayrollWorkbook,
  type WorkbookEdit,
} from './lib/workbook'
import {
  isPayableOverdue,
  readPayables,
  validatePayableDraft,
  writePayables,
  type PayableAccount,
  type PayableDraft,
  type PayableStatus,
} from './lib/payables'
import './App.css'

const INITIAL_VISIBLE_COLUMNS = [
  'cedula v',
  'apellido',
  'nombre',
  'cargo',
  'sueldo semanal',
  'total nomina',
  'total deduccion',
  'total a pagar',
  'cantidad recibida en $',
  'cantidad recibida en bs',
]

function findColumn(sheet: PayrollSheet, phrase: string) {
  const target = normalizeText(phrase)
  return sheet.headers.find((header) => normalizeText(header).includes(target))
}

function getNumericValue(record: PayrollRecord, header: string | undefined) {
  if (!header) return 0
  const value = record[header]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return 0

  const cleaned = value.replace(/[^\d,.-]/g, '')
  if (!cleaned) return 0

  const comma = cleaned.lastIndexOf(',')
  const period = cleaned.lastIndexOf('.')
  const normalized = comma >= 0 && period >= 0
    ? comma > period
      ? cleaned.replaceAll('.', '').replace(',', '.')
      : cleaned.replaceAll(',', '')
    : comma >= 0
      ? cleaned.replace(',', '.')
      : cleaned
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatAmount(value: number) {
  return new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function downloadCsv(sheet: PayrollSheet, rows: PayrollRecord[]) {
  const headers = sheet.headers
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) =>
      headers
        .map((header) => escape(formatCellValue(row[header]).replaceAll('\r', ' ').replaceAll('\n', ' ')))
        .join(','),
    ),
  ]
  const blob = new Blob(['\uFEFF', lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${sheet.name.replaceAll(/[^\p{L}\p{N}-]+/gu, '_')}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function inputValue(value: CellValue | undefined) {
  if (value == null) return ''
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${month}-${day}`
  }
  return String(value)
}

function todayString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function displayDate(value: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium' })
    .format(new Date(`${value}T12:00:00`))
}

function blankPayableDraft(): PayableDraft {
  const today = todayString()
  return {
    supplier: '',
    document: '',
    concept: '',
    issueDate: today,
    dueDate: today,
    amount: 0,
    currency: 'USD',
    status: 'Pendiente',
    notes: '',
  }
}

function PayrollDashboard() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [initialPayables] = useState(() => {
    try {
      return { accounts: readPayables(window.localStorage), error: '' }
    } catch (cause) {
      return {
        accounts: [],
        error: cause instanceof Error
          ? cause.message
          : 'No se pudieron leer las cuentas por pagar guardadas en este dispositivo.',
      }
    }
  })
  const [workbook, setWorkbook] = useState<PayrollWorkbook | null>(null)
  const [workbookEdits, setWorkbookEdits] = useState<WorkbookEdit[]>([])
  const [activeSheetName, setActiveSheetName] = useState('')
  const [activeView, setActiveView] = useState<'payroll' | 'payables'>('payroll')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showAllColumns, setShowAllColumns] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingWorkbook, setIsSavingWorkbook] = useState(false)
  const [error, setError] = useState(initialPayables.error)
  const [editingRecord, setEditingRecord] = useState<PayrollRecord | null>(null)
  const [editingValues, setEditingValues] = useState<Record<string, string>>({})
  const [editingFieldQuery, setEditingFieldQuery] = useState('')
  const [recordFormError, setRecordFormError] = useState('')
  const [payables, setPayables] = useState<PayableAccount[]>(initialPayables.accounts)
  const [payablesQuery, setPayablesQuery] = useState('')
  const [payablesStatusFilter, setPayablesStatusFilter] = useState<'Todas' | PayableStatus>('Todas')
  const [payableEditorOpen, setPayableEditorOpen] = useState(false)
  const [editingPayable, setEditingPayable] = useState<PayableAccount | null>(null)
  const [payableDraft, setPayableDraft] = useState<PayableDraft>(blankPayableDraft)
  const [payableFormError, setPayableFormError] = useState('')

  const activeSheet = workbook?.sheets.find((sheet) => sheet.name === activeSheetName)
  const normalizedQuery = normalizeText(query.trim())
  const editedRowMap = useMemo(() => {
    const rows = new Map<number, PayrollRecord>()
    if (!activeSheet) return rows
    for (const row of activeSheet.rows) {
      rows.set(row.__rowNumber, { ...row })
    }
    for (const edit of workbookEdits) {
      if (edit.sheetName !== activeSheet.name) continue
      const row = rows.get(edit.rowNumber)
      const header = activeSheet.headers[edit.columnNumber - 1]
      if (row && header) row[header] = edit.value
    }
    return rows
  }, [activeSheet, workbookEdits])

  const roleHeader = activeSheet && findColumn(activeSheet, 'cargo')
  const roles = useMemo(() => {
    if (!activeSheet || !roleHeader) return []
    return [...new Set(
      [...editedRowMap.values()]
        .map((row) => formatCellValue(row[roleHeader]).trim())
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, 'es'))
  }, [activeSheet, editedRowMap, roleHeader])

  const filteredRows = useMemo(() => {
    if (!activeSheet) return []
    return [...editedRowMap.values()].filter((row) => {
      if (roleFilter && roleHeader && formatCellValue(row[roleHeader]) !== roleFilter) {
        return false
      }
      if (!normalizedQuery) return true
      return activeSheet.headers.some((header) =>
        normalizeText(formatCellValue(row[header])).includes(normalizedQuery),
      )
    })
  }, [activeSheet, editedRowMap, normalizedQuery, roleFilter, roleHeader])

  const visibleColumns = useMemo(() => {
    if (!activeSheet) return []
    if (showAllColumns || activeSheet.headers.length <= 8) return activeSheet.headers
    const preferred = INITIAL_VISIBLE_COLUMNS
      .map((key) => activeSheet.headers.find((header) => normalizeText(header).includes(key)))
      .filter((header): header is string => Boolean(header))
    return preferred.length > 0 ? preferred : activeSheet.headers.slice(0, 8)
  }, [activeSheet, showAllColumns])

  const totals = useMemo(() => {
    if (!activeSheet) return null
    const payHeader = findColumn(activeSheet, 'total a pagar')
      ?? findColumn(activeSheet, 'total nomina')
    const usdHeader = findColumn(activeSheet, 'cantidad recibida en $')
    const bsHeader = findColumn(activeSheet, 'cantidad recibida en bs')
    if (!payHeader && !usdHeader && !bsHeader) return null

    return filteredRows.reduce(
      (acc, row) => ({
        pay: acc.pay + getNumericValue(row, payHeader),
        usd: acc.usd + getNumericValue(row, usdHeader),
        bs: acc.bs + getNumericValue(row, bsHeader),
      }),
      { pay: 0, usd: 0, bs: 0 },
    )
  }, [activeSheet, filteredRows])

  const filteredPayables = useMemo(() => {
    const term = normalizeText(payablesQuery.trim())
    return payables.filter((account) => {
      if (payablesStatusFilter !== 'Todas' && account.status !== payablesStatusFilter) return false
      return !term || [
        account.supplier,
        account.document,
        account.concept,
        account.notes,
        account.currency,
        account.status,
      ].some((value) => normalizeText(value).includes(term))
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [payables, payablesQuery, payablesStatusFilter])

  const payablesSummary = useMemo(() => {
    const today = todayString()
    return payables.reduce(
      (summary, account) => {
        if (account.status === 'Pendiente') {
          summary.pendingCount += 1
          if (account.currency === 'USD') summary.pendingUsd += account.amount
          else summary.pendingVes += account.amount
          if (isPayableOverdue(account, today)) summary.overdueCount += 1
        }
        return summary
      },
      { pendingCount: 0, pendingUsd: 0, pendingVes: 0, overdueCount: 0 },
    )
  }, [payables])

  function persistPayables(next: PayableAccount[]) {
    try {
      writePayables(window.localStorage, next)
      setPayables(next)
      setError('')
      return true
    } catch (cause) {
      setError(cause instanceof Error
        ? `No se pudieron guardar las cuentas por pagar en este dispositivo: ${cause.message}`
        : 'No se pudieron guardar las cuentas por pagar en este dispositivo.')
      return false
    }
  }

  async function handleFile(file?: File) {
    if (!file) return
    setError('')
    setIsLoading(true)
    try {
      const loaded = await loadPayrollWorkbook(file)
      setWorkbook(loaded)
      setWorkbookEdits([])
      setActiveView('payroll')
      setActiveSheetName(
        loaded.sheets.find((sheet) => normalizeText(sheet.name) === 'nomina')?.name
          ?? loaded.sheets[0]?.name
          ?? '',
      )
      setQuery('')
      setRoleFilter('')
      setShowAllColumns(false)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'No se pudo leer el archivo. Verifica que sea un libro Excel válido.')
    } finally {
      setIsLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleSaveWorkbook() {
    if (!workbook) return
    setError('')
    setIsSavingWorkbook(true)
    try {
      const blob = await exportEditedWorkbook(workbook, workbookEdits)
      const baseName = workbook.fileName.replace(/\.xlsx$/i, '')
      downloadBlob(blob, `${baseName}-editada.xlsx`)
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'No se pudieron exportar los cambios del libro.')
    } finally {
      setIsSavingWorkbook(false)
    }
  }

  function openRecordEditor(record: PayrollRecord) {
    setEditingRecord(record)
    setEditingFieldQuery('')
    setEditingValues(Object.fromEntries(
      activeSheet?.headers.map((header) => [header, inputValue(record[header])]) ?? [],
    ))
    setRecordFormError('')
  }

  function saveRecordEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeSheet || !editingRecord) return

    try {
      const nextEdits = workbookEdits.filter((edit) =>
        !(edit.sheetName === activeSheet.name && edit.rowNumber === editingRecord.__rowNumber),
      )
      activeSheet.headers.forEach((header, index) => {
        const nextValue = parsePayrollCellEdit(
          editingValues[header] ?? '',
          editingRecord[header] ?? null,
          header,
        )
        const originalValue = activeSheet.rows.find((row) => row.__rowNumber === editingRecord.__rowNumber)?.[header] ?? null
        const sameValue = nextValue instanceof Date && originalValue instanceof Date
          ? inputValue(nextValue) === inputValue(originalValue)
          : nextValue === originalValue
        if (!sameValue) {
          nextEdits.push({
            sheetName: activeSheet.name,
            rowNumber: editingRecord.__rowNumber,
            columnNumber: index + 1,
            value: nextValue,
          })
        }
      })
      setWorkbookEdits(nextEdits)
      setEditingRecord(null)
      setRecordFormError('')
    } catch (cause) {
      setRecordFormError(cause instanceof Error ? cause.message : 'Revisa los valores ingresados.')
    }
  }

  function openPayableEditor(account?: PayableAccount) {
    setPayableEditorOpen(true)
    setEditingPayable(account ?? null)
    setPayableDraft(account ? { ...account } : blankPayableDraft())
    setPayableFormError('')
  }

  function savePayable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = validatePayableDraft(payableDraft)
    if (message) {
      setPayableFormError(message)
      return
    }

    const account: PayableAccount = {
      ...payableDraft,
      supplier: payableDraft.supplier.trim(),
      document: payableDraft.document.trim(),
      concept: payableDraft.concept.trim(),
      notes: payableDraft.notes.trim(),
      id: editingPayable?.id ?? crypto.randomUUID(),
    }
    const next = editingPayable
      ? payables.map((item) => item.id === editingPayable.id ? account : item)
      : [...payables, account]
    if (persistPayables(next)) setPayableEditorOpen(false)
  }

  function deletePayable(account: PayableAccount) {
    if (!window.confirm(`¿Eliminar la cuenta por pagar «${account.document}» de ${account.supplier}?`)) return
    persistPayables(payables.filter((item) => item.id !== account.id))
  }

  function togglePayableStatus(account: PayableAccount) {
    const status: PayableStatus = account.status === 'Pendiente' ? 'Pagada' : 'Pendiente'
    persistPayables(payables.map((item) => item.id === account.id ? { ...item, status } : item))
  }

  function exportPayablesCsv() {
    const headers = ['Proveedor', 'Factura/documento', 'Concepto', 'Emisión', 'Vencimiento', 'Monto', 'Moneda', 'Estado', 'Observaciones']
    const rows = filteredPayables.map((account) => [
      account.supplier,
      account.document,
      account.concept,
      account.issueDate,
      account.dueDate,
      String(account.amount),
      account.currency,
      account.status,
      account.notes,
    ])
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
    const blob = new Blob(['\uFEFF', [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
    downloadBlob(blob, 'cuentas-por-pagar.csv')
  }

  const editableHeaders = activeSheet?.headers.filter((header) =>
    normalizeText(header).includes(normalizeText(editingFieldQuery.trim())),
  ) ?? []
  const appClass = workbook ? 'app app--loaded' : 'app'

  return (
    <div className={appClass}>
      <header className="topbar">
        <div className="topbar__brand">
          <div className="brand-mark" aria-hidden="true"><Banknote size={22} /></div>
          <div>
            <div className="brand-name">Nómina Clara</div>
            <div className="brand-caption">Gestión de nómina</div>
          </div>
        </div>
        <div className="topbar__right">
          <span className="local-badge"><LockKeyhole size={13} /> Procesamiento local</span>
          <button
            className="button button--primary topbar__load"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isLoading}
          >
            {workbook ? <FileSpreadsheet size={16} /> : <Upload size={16} />}
            {workbook ? 'Cambiar Excel' : 'Cargar Excel'}
          </button>
        </div>
      </header>

      <main className="main">
        <nav className="section-nav" aria-label="Secciones">
          <button
            type="button"
            className={activeView === 'payroll' ? 'section-nav__item is-active' : 'section-nav__item'}
            aria-current={activeView === 'payroll' ? 'page' : undefined}
            onClick={() => setActiveView('payroll')}
          >
            <Users size={16} /> Nómina
            {workbook && <span className="section-nav__count">{workbook.sheets.length}</span>}
          </button>
          <button
            type="button"
            className={activeView === 'payables' ? 'section-nav__item is-active' : 'section-nav__item'}
            aria-current={activeView === 'payables' ? 'page' : undefined}
            onClick={() => setActiveView('payables')}
          >
            <ClipboardList size={16} /> Cuentas por pagar
            {payables.length > 0 && <span className="section-nav__count">{payables.length}</span>}
          </button>
        </nav>

        <section className="page-heading">
          <div>
            <div className="eyebrow"><BriefcaseBusiness size={14} /> CONTROL DE PERSONAL</div>
            <h1>{activeView === 'payroll' ? 'Panel de nómina' : 'Cuentas por pagar'}</h1>
            <p className="page-subtitle">
              {activeView === 'payroll'
                ? 'Consulta, edita y exporta los datos de tu libro de Excel.'
                : 'Registra y controla facturas pendientes de proveedores.'}
            </p>
          </div>
          {workbook && activeView === 'payroll' && (
            <div className="loaded-file">
              <span className="loaded-file__icon"><FileSpreadsheet size={18} /></span>
              <span className="loaded-file__details">
                <strong title={workbook.fileName}>{workbook.fileName}</strong>
                <small>{workbook.sheets.length} hojas · cargado en este dispositivo</small>
              </span>
              <Check className="loaded-file__check" size={17} />
            </div>
          )}
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <CircleAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        {isLoading && activeView === 'payroll' ? (
          <section className="empty-state">
            <div className="empty-state__icon empty-state__icon--loading"><FileSpreadsheet size={30} /></div>
            <h2>Leyendo el libro…</h2>
            <p>Estamos preparando las hojas y sus datos para consulta local.</p>
          </section>
        ) : activeView === 'payables' ? (
          <>
            <section className="stat-grid" aria-label="Resumen de cuentas por pagar">
              <article className="stat-card">
                <div className="stat-card__top"><span>Cuentas pendientes</span><ClipboardList size={18} /></div>
                <strong>{payablesSummary.pendingCount.toLocaleString('es-VE')}</strong>
                <small>Facturas por pagar</small>
              </article>
              <article className="stat-card">
                <div className="stat-card__top"><span>Pendiente en USD</span><Banknote size={18} /></div>
                <strong>{formatCurrency(payablesSummary.pendingUsd, 'USD')}</strong>
                <small>Proveedores, estado pendiente</small>
              </article>
              <article className="stat-card">
                <div className="stat-card__top"><span>Pendiente en bolívares</span><Banknote size={18} /></div>
                <strong>{formatCurrency(payablesSummary.pendingVes, 'VES')}</strong>
                <small>Proveedores, estado pendiente</small>
              </article>
              <article className="stat-card">
                <div className="stat-card__top"><span>Vencidas</span><CircleAlert size={18} /></div>
                <strong>{payablesSummary.overdueCount.toLocaleString('es-VE')}</strong>
                <small>Requieren atención</small>
              </article>
            </section>

            <section className="data-panel">
              <div className="data-panel__heading">
                <div>
                  <h2>Facturas de proveedores</h2>
                  <p>{filteredPayables.length.toLocaleString('es-VE')} de {payables.length.toLocaleString('es-VE')} cuentas</p>
                </div>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={exportPayablesCsv}
                    disabled={filteredPayables.length === 0}
                  >
                    <ArrowDownToLine size={16} /> Exportar CSV
                  </button>
                  <button type="button" className="button button--primary" onClick={() => openPayableEditor()}>
                    <CirclePlus size={16} /> Nueva cuenta
                  </button>
                </div>
              </div>

              <div className="toolbar">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    type="search"
                    placeholder="Buscar proveedor, factura o concepto…"
                    value={payablesQuery}
                    onChange={(event) => setPayablesQuery(event.target.value)}
                  />
                </label>
                <label className="select-field select-field--role">
                  <span className="sr-only">Estado de cuenta</span>
                  <ClipboardList size={16} />
                  <select
                    value={payablesStatusFilter}
                    onChange={(event) => setPayablesStatusFilter(event.target.value as 'Todas' | PayableStatus)}
                  >
                    <option value="Todas">Todos los estados</option>
                    <option value="Pendiente">Pendientes</option>
                    <option value="Pagada">Pagadas</option>
                  </select>
                  <ChevronDown size={15} />
                </label>
              </div>

              <div className="table-scroll">
                <table className="payables-table">
                  <thead>
                    <tr>
                      <th>Proveedor</th>
                      <th>Factura / documento</th>
                      <th>Concepto</th>
                      <th>Vencimiento</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayables.map((account) => {
                      const overdue = isPayableOverdue(account, todayString())
                      return (
                        <tr key={account.id}>
                          <td className="supplier-cell">
                            <strong>{account.supplier}</strong>
                            {account.notes && <small title={account.notes}>{account.notes}</small>}
                          </td>
                          <td>{account.document}</td>
                          <td>{account.concept}</td>
                          <td className={overdue ? 'due-date due-date--overdue' : 'due-date'}>
                            {displayDate(account.dueDate)}
                            {overdue && <small>Vencida</small>}
                          </td>
                          <td className="amount-cell">{formatCurrency(account.amount, account.currency)}</td>
                          <td>
                            <span className={account.status === 'Pagada' ? 'status-pill status-pill--paid' : overdue ? 'status-pill status-pill--overdue' : 'status-pill status-pill--pending'}>
                              {account.status === 'Pagada' ? 'Pagada' : overdue ? 'Vencida' : 'Pendiente'}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Editar ${account.document}`}
                                title="Editar cuenta"
                                onClick={() => openPayableEditor(account)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={account.status === 'Pendiente' ? `Marcar pagada ${account.document}` : `Marcar pendiente ${account.document}`}
                                title={account.status === 'Pendiente' ? 'Marcar pagada' : 'Marcar pendiente'}
                                onClick={() => togglePayableStatus(account)}
                              >
                                {account.status === 'Pendiente' ? <Check size={16} /> : <ArrowUpRight size={16} />}
                              </button>
                              <button
                                type="button"
                                className="icon-button icon-button--danger"
                                aria-label={`Eliminar ${account.document}`}
                                title="Eliminar cuenta"
                                onClick={() => deletePayable(account)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredPayables.length === 0 && (
                      <tr>
                        <td className="table-empty" colSpan={7}>
                          {payables.length === 0
                            ? 'Todavía no hay cuentas. Usa “Nueva cuenta” para registrar una factura de proveedor.'
                            : 'No se encontraron cuentas con esos filtros.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : !workbook ? (
          <section className="empty-state">
            <div className="empty-state__icon"><FileSpreadsheet size={30} /></div>
            <p className="eyebrow">LISTO PARA EMPEZAR</p>
            <h2>Carga tu archivo de nómina</h2>
            <p>Selecciona un archivo .xlsx. Las hojas se procesan en tu equipo y no se envían a ningún servidor.</p>
            <button
              className="button button--primary empty-state__button"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={17} /> Seleccionar archivo Excel
            </button>
            <div className="privacy-note"><ShieldCheck size={15} /> Tus datos personales y bancarios permanecen en este dispositivo.</div>
          </section>
        ) : activeSheet ? (
          <>
            <section className="stat-grid" aria-label="Resumen de la hoja actual">
              <article className="stat-card">
                <div className="stat-card__top"><span>Registros</span><Users size={18} /></div>
                <strong>{filteredRows.length.toLocaleString('es-VE')}</strong>
                <small>{activeSheet.name}</small>
              </article>
              {totals && (
                <>
                  {findColumn(activeSheet, 'total a pagar') && (
                    <article className="stat-card">
                      <div className="stat-card__top"><span>Total a pagar (Excel)</span><Banknote size={18} /></div>
                      <strong>{formatAmount(totals.pay)}</strong>
                      <small>Según los registros filtrados</small>
                    </article>
                  )}
                  {findColumn(activeSheet, 'cantidad recibida en $') && (
                    <article className="stat-card">
                      <div className="stat-card__top"><span>Recibido en divisas</span><Banknote size={18} /></div>
                      <strong>{formatCurrency(totals.usd, 'USD')}</strong>
                      <small>Columna “Cantidad recibida en $”</small>
                    </article>
                  )}
                  {findColumn(activeSheet, 'cantidad recibida en bs') && (
                    <article className="stat-card">
                      <div className="stat-card__top"><span>Recibido en bolívares</span><Banknote size={18} /></div>
                      <strong>{formatCurrency(totals.bs, 'VES')}</strong>
                      <small>Columna “Cantidad recibida en Bs”</small>
                    </article>
                  )}
                </>
              )}
            </section>

            <section className="data-panel">
              <div className="data-panel__heading">
                <div>
                  <h2>Datos del libro</h2>
                  <p>{filteredRows.length.toLocaleString('es-VE')} de {activeSheet.rows.length.toLocaleString('es-VE')} registros</p>
                </div>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => downloadCsv(activeSheet, filteredRows)}
                  disabled={filteredRows.length === 0}
                >
                  <ArrowDownToLine size={16} /> Exportar CSV
                </button>
                {workbookEdits.length > 0 && (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void handleSaveWorkbook()}
                    disabled={isSavingWorkbook}
                  >
                    <FileDown size={16} /> {isSavingWorkbook ? 'Preparando Excel…' : `Descargar Excel editado (${workbookEdits.length})`}
                  </button>
                )}
              </div>

              <div className="toolbar">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    type="search"
                    placeholder="Buscar en todos los campos…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label className="select-field">
                  <span className="sr-only">Hoja del libro</span>
                  <FileSpreadsheet size={16} />
                  <select
                    value={activeSheet.name}
                    onChange={(event) => {
                      setActiveSheetName(event.target.value)
                      setRoleFilter('')
                      setShowAllColumns(false)
                    }}
                  >
                    {workbook.sheets.map((sheet) => (
                      <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={15} />
                </label>
                {roleHeader && roles.length > 0 && (
                  <label className="select-field select-field--role">
                    <span className="sr-only">Filtrar por cargo</span>
                    <BriefcaseBusiness size={16} />
                    <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                      <option value="">Todos los cargos</option>
                      {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                    <ChevronDown size={15} />
                  </label>
                )}
              </div>

              <div className="table-meta">
                <span><HardDrive size={14} /> Hoja: <strong>{activeSheet.name}</strong></span>
                {activeSheet.headers.length > 8 && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setShowAllColumns((value) => !value)}
                  >
                    {showAllColumns ? 'Mostrar columnas principales' : `Mostrar todas las columnas (${activeSheet.headers.length})`}
                  </button>
                )}
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th className="row-number">#</th>
                      {visibleColumns.map((header) => <th key={header}>{header}</th>)}
                      <th className="row-actions-header">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, index) => (
                      <tr key={`${activeSheet.name}-${row.__rowNumber}`}>
                        <td className="row-number">{index + 1}</td>
                        {visibleColumns.map((header) => (
                          <td key={header} title={formatCellValue(row[header])}>
                            {formatCellValue(row[header]) || <span className="cell-empty">—</span>}
                          </td>
                        ))}
                        <td className="row-actions-cell">
                          <button
                            type="button"
                            className="row-edit-button"
                            aria-label={`Editar fila ${index + 1}`}
                            title="Editar todos los campos de este registro"
                            onClick={() => openRecordEditor(row)}
                          >
                            <Pencil size={14} /> Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td className="table-empty" colSpan={visibleColumns.length + 2}>
                          No se encontraron registros para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="empty-state">
            <div className="empty-state__icon"><FileSpreadsheet size={30} /></div>
            <h2>El libro no contiene hojas consultables</h2>
            <p>Verifica que el Excel tenga filas con datos y vuelve a cargarlo.</p>
          </section>
        )}

        <footer className="footer-note">
          <LockKeyhole size={14} />
          <span>Los cambios del Excel se descargan en una copia nueva. Las cuentas por pagar se guardan en este dispositivo.</span>
        </footer>
      </main>

      {editingRecord && activeSheet && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditingRecord(null)
        }}>
          <section className="editor-modal editor-modal--record" role="dialog" aria-modal="true" aria-labelledby="record-editor-title">
            <header className="editor-modal__header">
              <div>
                <h2 id="record-editor-title">Editar registro de nómina</h2>
                <p>Fila {editingRecord.__rowNumber} · puedes cambiar todas las columnas y sus números.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Cerrar editor" onClick={() => setEditingRecord(null)}>×</button>
            </header>
            <form onSubmit={saveRecordEdit}>
              <div className="record-editor-tools">
                <label className="editor-field-search">
                  <Search size={16} />
                  <input
                    type="search"
                    aria-label="Buscar columna para editar"
                    placeholder="Buscar columna: bolívares, bono, deducción…"
                    value={editingFieldQuery}
                    onChange={(event) => setEditingFieldQuery(event.target.value)}
                  />
                </label>
                <p>
                  {editingFieldQuery
                    ? `${editableHeaders.length} de ${activeSheet.headers.length} columnas`
                    : `${activeSheet.headers.length} columnas disponibles`}
                  {' · '}Para montos puedes usar coma decimal, por ejemplo <strong>1.234,56</strong>.
                </p>
              </div>
              <div className="record-fields">
                {editableHeaders.map((header) => {
                  const original = editingRecord[header] ?? null
                  const numericField = isNumericPayrollField(header, original)
                  const dateField = isDatePayrollField(header, original)
                  return (
                    <label className="form-field" key={header}>
                      <span>{header}</span>
                      {typeof original === 'boolean' ? (
                        <select
                          value={editingValues[header] ?? ''}
                          onChange={(event) => setEditingValues((current) => ({ ...current, [header]: event.target.value }))}
                        >
                          <option value="">Vacío</option>
                          <option value="true">Sí</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          type={dateField ? 'date' : 'text'}
                          inputMode={numericField ? 'decimal' : undefined}
                          placeholder={numericField && /\bbs\b|bolivar/i.test(header) ? 'Ej.: 1.234,56' : undefined}
                          value={editingValues[header] ?? ''}
                          onChange={(event) => setEditingValues((current) => ({ ...current, [header]: event.target.value }))}
                        />
                      )}
                    </label>
                  )
                })}
              </div>
              {recordFormError && <p className="form-error" role="alert">{recordFormError}</p>}
              <footer className="editor-modal__footer">
                <span>Se conservará intacto el Excel original.</span>
                <div>
                  <button type="button" className="button button--secondary" onClick={() => setEditingRecord(null)}>Cancelar</button>
                  <button type="submit" className="button button--primary"><Save size={16} /> Aplicar cambios</button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}

      {payableEditorOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPayableEditorOpen(false)
        }}>
          <section className="editor-modal editor-modal--payable" role="dialog" aria-modal="true" aria-labelledby="payable-editor-title">
            <header className="editor-modal__header">
              <div>
                <h2 id="payable-editor-title">{editingPayable ? 'Editar cuenta por pagar' : 'Nueva cuenta por pagar'}</h2>
                <p>Datos de facturas de proveedores, independientes de la nómina.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Cerrar formulario" onClick={() => setPayableEditorOpen(false)}>×</button>
            </header>
            <form onSubmit={savePayable}>
              <div className="payable-fields">
                <label className="form-field">
                  <span>Proveedor *</span>
                  <input required autoFocus value={payableDraft.supplier} onChange={(event) => setPayableDraft((current) => ({ ...current, supplier: event.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Factura o documento *</span>
                  <input required value={payableDraft.document} onChange={(event) => setPayableDraft((current) => ({ ...current, document: event.target.value }))} />
                </label>
                <label className="form-field form-field--wide">
                  <span>Concepto *</span>
                  <input required value={payableDraft.concept} onChange={(event) => setPayableDraft((current) => ({ ...current, concept: event.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Fecha de emisión *</span>
                  <input required type="date" value={payableDraft.issueDate} onChange={(event) => setPayableDraft((current) => ({ ...current, issueDate: event.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Fecha de vencimiento *</span>
                  <input required type="date" value={payableDraft.dueDate} onChange={(event) => setPayableDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Monto *</span>
                  <input required min="0.01" step="0.01" type="number" value={payableDraft.amount || ''} onChange={(event) => setPayableDraft((current) => ({ ...current, amount: Number(event.target.value) }))} />
                </label>
                <label className="form-field">
                  <span>Moneda</span>
                  <select value={payableDraft.currency} onChange={(event) => setPayableDraft((current) => ({ ...current, currency: event.target.value as PayableDraft['currency'] }))}>
                    <option value="USD">USD — Dólar</option>
                    <option value="VES">VES — Bolívar</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Estado</span>
                  <select value={payableDraft.status} onChange={(event) => setPayableDraft((current) => ({ ...current, status: event.target.value as PayableStatus }))}>
                    <option value="Pendiente">Pendiente</option>
                    <option value="Pagada">Pagada</option>
                  </select>
                </label>
                <label className="form-field form-field--wide">
                  <span>Notas</span>
                  <textarea rows={3} value={payableDraft.notes} onChange={(event) => setPayableDraft((current) => ({ ...current, notes: event.target.value }))} />
                </label>
              </div>
              {payableFormError && <p className="form-error" role="alert">{payableFormError}</p>}
              <footer className="editor-modal__footer">
                <span>Se guarda localmente en este dispositivo.</span>
                <div>
                  <button type="button" className="button button--secondary" onClick={() => setPayableEditorOpen(false)}>Cancelar</button>
                  <button type="submit" className="button button--primary"><Save size={16} /> Guardar cuenta</button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
    </div>
  )
}

export default PayrollDashboard

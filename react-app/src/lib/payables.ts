export type PayableStatus = 'Pendiente' | 'Pagada'
export type PayableCurrency = 'USD' | 'VES'

export type PayableAccount = {
  id: string
  supplier: string
  document: string
  concept: string
  issueDate: string
  dueDate: string
  amount: number
  currency: PayableCurrency
  status: PayableStatus
  notes: string
}

export type PayableDraft = Omit<PayableAccount, 'id'>

const STORAGE_KEY = 'nomina-clara:payables:v1'

export function readPayables(storage: Pick<Storage, 'getItem'>): PayableAccount[] {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return []

  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error('El registro local de cuentas por pagar no tiene un formato válido.')
  }

  return parsed.map((entry): PayableAccount => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('El registro local de cuentas por pagar contiene un elemento inválido.')
    }

    const item = entry as Record<string, unknown>
    const valid =
      typeof item.id === 'string'
      && typeof item.supplier === 'string'
      && typeof item.document === 'string'
      && typeof item.concept === 'string'
      && typeof item.issueDate === 'string'
      && typeof item.dueDate === 'string'
      && typeof item.amount === 'number'
      && Number.isFinite(item.amount)
      && (item.currency === 'USD' || item.currency === 'VES')
      && (item.status === 'Pendiente' || item.status === 'Pagada')
      && typeof item.notes === 'string'

    if (!valid) {
      throw new Error('El registro local de cuentas por pagar contiene campos inválidos.')
    }
    return item as PayableAccount
  })
}

export function writePayables(storage: Pick<Storage, 'setItem'>, accounts: PayableAccount[]) {
  storage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

export function validatePayableDraft(draft: PayableDraft) {
  if (!draft.supplier.trim()) return 'Escribe el nombre del proveedor.'
  if (!draft.document.trim()) return 'Escribe el número de factura o documento.'
  if (!draft.concept.trim()) return 'Describe el concepto de la cuenta.'
  if (!draft.issueDate || !draft.dueDate) return 'Indica las fechas de emisión y vencimiento.'
  if (draft.dueDate < draft.issueDate) return 'El vencimiento no puede ser anterior a la fecha de emisión.'
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) return 'El monto debe ser mayor que cero.'
  return ''
}

export function isPayableOverdue(account: PayableAccount, today: string) {
  return account.status === 'Pendiente' && account.dueDate < today
}

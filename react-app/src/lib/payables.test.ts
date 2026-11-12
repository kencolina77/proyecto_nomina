import { describe, expect, it } from 'vitest'
import {
  isPayableOverdue,
  readPayables,
  validatePayableDraft,
  writePayables,
  type PayableAccount,
  type PayableDraft,
} from './payables'

function makeStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

const draft: PayableDraft = {
  supplier: 'Proveedor de prueba',
  document: 'FAC-001',
  concept: 'Servicio',
  issueDate: '2026-10-01',
  dueDate: '2026-10-30',
  amount: 125.5,
  currency: 'USD',
  status: 'Pendiente',
  notes: '',
}

describe('accounts payable', () => {
  it('persists and reloads supplier accounts locally', () => {
    const storage = makeStorage()
    const account: PayableAccount = { ...draft, id: 'test-1' }

    writePayables(storage, [account])

    expect(readPayables(storage)).toEqual([account])
  })

  it('rejects invalid amounts and due dates', () => {
    expect(validatePayableDraft({ ...draft, amount: 0 })).toContain('mayor que cero')
    expect(validatePayableDraft({ ...draft, dueDate: '2026-09-30' })).toContain('anterior')
  })

  it('marks only pending bills past their due date as overdue', () => {
    const account: PayableAccount = { ...draft, id: 'test-1' }
    expect(isPayableOverdue(account, '2026-11-01')).toBe(true)
    expect(isPayableOverdue({ ...account, status: 'Pagada' }, '2026-11-01')).toBe(false)
    expect(isPayableOverdue(account, '2026-10-30')).toBe(false)
  })
})

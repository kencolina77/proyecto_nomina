import type ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

export type CellValue = string | number | boolean | Date | null

export type PayrollRecord = {
  __rowNumber: number
  [header: string]: CellValue | number
}

export type PayrollSheet = {
  name: string
  headers: string[]
  rows: PayrollRecord[]
  headerRowNumber: number
}

export type PayrollWorkbook = {
  fileName: string
  sheets: PayrollSheet[]
  sourceWorkbook: ExcelJS.Workbook
}

export type WorkbookEdit = {
  sheetName: string
  rowNumber: number
  columnNumber: number
  value: CellValue
}

type XmlObject = Record<string, unknown>
type FormulaCache = Map<string, Map<string, CellValue>>

const HEADER_TERMS: Record<string, number> = {
  cedula: 4,
  nombre: 2,
  apellido: 2,
  cargo: 1,
  sueldo: 1,
  personal: 1,
  banco: 0.5,
}

function asXmlObjects(value: unknown): XmlObject[] {
  const entries = Array.isArray(value) ? value : [value]
  return entries.filter(
    (entry): entry is XmlObject => typeof entry === 'object' && entry !== null,
  )
}

function getFormulaCacheValue(
  cell: XmlObject,
  sharedStrings: string[],
): CellValue | undefined {
  const raw = cell['v']
  if (raw == null || raw === '') return undefined

  const value = String(raw)
  switch (String(cell['@_t'] ?? 'n')) {
    case 'str':
    case 'inlineStr':
    case 'e':
      return value
    case 'b':
      return value === '1'
    case 's':
      return sharedStrings[Number(value)] ?? ''
    default: {
      const number = Number(value)
      return Number.isFinite(number) ? number : value
    }
  }
}

async function readFormulaCache(data: ArrayBuffer): Promise<FormulaCache> {
  const zip = await JSZip.loadAsync(data)
  const workbookFile = zip.file('xl/workbook.xml')
  const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (!workbookFile || !relationshipsFile) return new Map()

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const workbookXml = parser.parse(await workbookFile.async('text')) as XmlObject
  const relationshipsXml = parser.parse(await relationshipsFile.async('text')) as XmlObject
  const workbookNode = asXmlObjects(workbookXml['workbook'])[0]
  const sheetsNode = asXmlObjects(workbookNode?.['sheets'])[0]
  const relationshipNode = asXmlObjects(relationshipsXml['Relationships'])[0]
  const sheetEntries = asXmlObjects(sheetsNode?.['sheet'])
  const relationships = asXmlObjects(relationshipNode?.['Relationship'])
  const relationTargets = new Map(
    relationships.map((relationship) => [
      String(relationship['@_Id']),
      String(relationship['@_Target']),
    ]),
  )

  const sharedStrings: string[] = []
  const sharedStringsFile = zip.file('xl/sharedStrings.xml')
  if (sharedStringsFile) {
    const sharedXml = parser.parse(await sharedStringsFile.async('text')) as XmlObject
    const sharedRoot = asXmlObjects(sharedXml['sst'])[0]
    for (const item of asXmlObjects(sharedRoot?.['si'])) {
      const plain = item['t']
      const richText = asXmlObjects(item['r'])
        .map((run) => String(run['t'] ?? ''))
        .join('')
      sharedStrings.push(typeof plain === 'string' ? plain : richText)
    }
  }

  const cache = new Map<string, Map<string, CellValue>>()
  for (const sheet of sheetEntries) {
    const name = String(sheet['@_name'] ?? '')
    const target = relationTargets.get(String(sheet['@_r:id']))
    if (!name || !target) continue

    const path = target.startsWith('/')
      ? target.slice(1)
      : target.startsWith('xl/')
        ? target
        : `xl/${target}`
    const sheetFile = zip.file(path)
    if (!sheetFile) continue

    const sheetXml = parser.parse(await sheetFile.async('text')) as XmlObject
    const worksheet = asXmlObjects(sheetXml['worksheet'])[0]
    const sheetData = asXmlObjects(worksheet?.['sheetData'])[0]
    const result = new Map<string, CellValue>()
    for (const row of asXmlObjects(sheetData?.['row'])) {
      for (const cell of asXmlObjects(row['c'])) {
        if (cell['f'] == null) continue
        const address = String(cell['@_r'] ?? '').toUpperCase()
        const value = getFormulaCacheValue(cell, sharedStrings)
        if (address && value !== undefined) result.set(address, value)
      }
    }
    cache.set(name, result)
  }

  return cache
}

function getRawValue(cell: ExcelJS.Cell, formulaCache?: Map<string, CellValue>): CellValue {
  const value = cell.value
  const cachedValue = formulaCache?.get(cell.address.toUpperCase())
  if (value == null) return cachedValue ?? null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if ('result' in value) {
    const result = value.result
    if (result instanceof Date) return result
    if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return result
    }
  }
  if (cachedValue !== undefined) return cachedValue
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  if ('text' in value) return value.text
  return cell.text || null
}

export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatCellValue(value: CellValue | undefined) {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium' }).format(value)
  }
  if (typeof value === 'number') {
    return new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 }).format(value)
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return value
}

export function isDatePayrollField(header: string, original: CellValue) {
  return original instanceof Date || /\bfecha\b|fecha de ingreso|fecha de pago/i.test(header)
}

export function isNumericPayrollField(header: string, original: CellValue) {
  if (original instanceof Date || typeof original === 'boolean' || isDatePayrollField(header, original)) {
    return false
  }
  if (typeof original === 'number') return true
  return /sueldo|salario|bono|deducci|nomina|prestamo|vacaciones descontad|dias faltantes|dias ausent|horas no trabajadas|llegadas tardes|total|monto|comision|domingo|feriado|prima|aporte|deuda|cantidad|recibid|bolivar|bolivares|\bbs\b|\bves\b|\busd\b|\bdolar\b|numero de hijos|n[°º.] de hijos|\bdia (?:ordinario|extra|faltante)|\bhora\b/i.test(header)
}

export function parsePayrollCellEdit(value: string, original: CellValue, header: string): CellValue {
  if (!value.trim()) return null
  if (isNumericPayrollField(header, original)) {
    const cleaned = value.trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '')
    const comma = cleaned.lastIndexOf(',')
    const period = cleaned.lastIndexOf('.')
    const normalized = comma >= 0 && period >= 0
      ? comma > period
        ? cleaned.replaceAll('.', '').replace(',', '.')
        : cleaned.replaceAll(',', '')
      : comma >= 0
        ? cleaned.replace(',', '.')
        : /^\d{1,3}(\.\d{3})+$/.test(cleaned)
          ? cleaned.replaceAll('.', '')
          : cleaned
    const parsed = Number(normalized)
    if (!/\d/.test(normalized) || !Number.isFinite(parsed)) {
      throw new Error('Revisa los campos numéricos; escribe un monto válido, por ejemplo 1.234,56.')
    }
    return parsed
  }
  if (isDatePayrollField(header, original)) {
    const parsed = new Date(`${value}T12:00:00`)
    if (Number.isNaN(parsed.getTime())) throw new Error('La fecha ingresada no es válida.')
    return parsed
  }
  if (typeof original === 'boolean') return value === 'true'
  return value
}

function findHeaderRow(worksheet: ExcelJS.Worksheet, formulaCache?: Map<string, CellValue>) {
  const lastRow = Math.min(worksheet.rowCount, 50)
  let bestRow = 0
  let bestScore = 0

  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const labels: string[] = []
    for (let column = 1; column <= row.cellCount; column += 1) {
      const value = getRawValue(row.getCell(column), formulaCache)
      if (value != null) labels.push(normalizeText(String(value)))
    }

    const score = labels.reduce((total, label) => {
      const term = Object.keys(HEADER_TERMS).find((candidate) => label.includes(candidate))
      return total + (term ? HEADER_TERMS[term] : 0)
    }, 0)

    if (score > bestScore) {
      bestScore = score
      bestRow = rowNumber
    }
  }

  return bestScore >= 3 ? bestRow : 0
}

function columnName(index: number) {
  let number = index
  let name = ''
  while (number > 0) {
    const remainder = (number - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    number = Math.floor((number - 1) / 26)
  }
  return name
}

function makeUniqueHeaders(
  worksheet: ExcelJS.Worksheet,
  headerRowNumber: number,
  formulaCache?: Map<string, CellValue>,
) {
  const row = worksheet.getRow(headerRowNumber)
  const headers: string[] = []
  const counts = new Map<string, number>()

  for (let column = 1; column <= row.cellCount; column += 1) {
    const value = getRawValue(row.getCell(column), formulaCache)
    const label = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (!label) {
      headers.push(`Columna ${columnName(column)}`)
      continue
    }

    const occurrence = (counts.get(label) ?? 0) + 1
    counts.set(label, occurrence)
    headers.push(occurrence === 1 ? label : `${label} (${occurrence})`)
  }

  return headers
}

function worksheetToRows(
  worksheet: ExcelJS.Worksheet,
  headers: string[],
  firstRowNumber: number,
  hasHeader: boolean,
  formulaCache?: Map<string, CellValue>,
) {
  const rows: PayrollRecord[] = []
  const lastRow = worksheet.rowCount

  for (let rowNumber = firstRowNumber; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const values: CellValue[] = []
    let hasContent = false

    for (let column = 1; column <= headers.length; column += 1) {
      const value = getRawValue(row.getCell(column), formulaCache)
      values.push(value)
      if (value != null && value !== '') hasContent = true
    }
    if (!hasContent) continue

    const record: PayrollRecord = { __rowNumber: rowNumber }
    values.forEach((value, index) => {
      record[headers[index]] = value
    })

    if (hasHeader) {
      const sequenceHeader = headers.find((header) => /^n(?:°|º|\.|umero)?$/i.test(normalizeText(header)))
      const sequenceValue = sequenceHeader ? record[sequenceHeader] : null
      const sequenceNumber = typeof sequenceValue === 'number'
        ? sequenceValue
        : Number(String(sequenceValue ?? '').trim())
      const isNumberedRow = Number.isFinite(sequenceNumber) && sequenceNumber > 0
      const hasIdentity = headers.some((header) => {
        const key = normalizeText(header)
        return (key.includes('cedula') || key === 'nombre' || key === 'apellido')
          && record[header] != null
          && String(record[header]).trim() !== ''
      })
      if (sequenceHeader ? !isNumberedRow : !hasIdentity) continue
    }

    rows.push(record)
  }

  return rows
}

function parseWorksheet(
  worksheet: ExcelJS.Worksheet,
  formulaCache?: Map<string, CellValue>,
): PayrollSheet {
  const detectedHeader = findHeaderRow(worksheet, formulaCache)
  const headerRowNumber = detectedHeader || 1
  const headers = makeUniqueHeaders(worksheet, headerRowNumber, formulaCache)
  const firstDataRow = detectedHeader ? headerRowNumber + 1 : 1

  return {
    name: worksheet.name,
    headers,
    rows: worksheetToRows(
      worksheet,
      headers,
      firstDataRow,
      Boolean(detectedHeader),
      formulaCache,
    ),
    headerRowNumber,
  }
}

export async function loadPayrollWorkbook(file: File): Promise<PayrollWorkbook> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Selecciona un archivo de Excel con formato .xlsx.')
  }
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('El archivo supera el límite de 100 MB.')
  }

  try {
    const { default: ExcelJSModule } = await import('exceljs')
    const workbook = new ExcelJSModule.Workbook()
    const fileData = await file.arrayBuffer()
    const [formulaCache] = await Promise.all([
      readFormulaCache(fileData),
      workbook.xlsx.load(fileData),
    ])
    if (workbook.worksheets.length === 0) {
      throw new Error('El archivo no contiene hojas de cálculo.')
    }

    return {
      fileName: file.name,
      sheets: workbook.worksheets.map((sheet) => parseWorksheet(sheet, formulaCache.get(sheet.name))),
      sourceWorkbook: workbook,
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('El archivo')) throw cause
    throw new Error('No se pudo leer el archivo .xlsx. Comprueba que no esté dañado o protegido con contraseña.')
  }
}

export async function exportEditedWorkbook(workbook: PayrollWorkbook, edits: WorkbookEdit[]) {
  for (const edit of edits) {
    const sheet = workbook.sourceWorkbook.getWorksheet(edit.sheetName)
    if (!sheet) {
      throw new Error(`No se encontró la hoja «${edit.sheetName}» al exportar el libro.`)
    }
    sheet.getRow(edit.rowNumber).getCell(edit.columnNumber).value = edit.value
  }

  workbook.sourceWorkbook.calcProperties.fullCalcOnLoad = true
  const data = await workbook.sourceWorkbook.xlsx.writeBuffer()
  return new Blob([data as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

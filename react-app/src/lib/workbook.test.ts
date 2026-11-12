import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  exportEditedWorkbook,
  formatCellValue,
  isDatePayrollField,
  isNumericPayrollField,
  loadPayrollWorkbook,
  normalizeText,
  parsePayrollCellEdit,
} from './workbook'

describe('payroll workbook reader', () => {
  it('detects the payroll header and returns all employee rows', async () => {
    const source = new ExcelJS.Workbook()
    const payroll = source.addWorksheet('NOMINA')
    payroll.addRow(['Reporte de nómina'])
    payroll.addRow([])
    payroll.addRow([])
    payroll.addRow(['N°', 'CÉDULA V-', 'APELLIDO', 'NOMBRE', 'CARGO', 'TOTAL A PAGAR'])
    payroll.addRow([1, '100', 'García', 'Ana', 'SUPERVISOR', 1250.5])
    payroll.addRow([2, '', 'Pérez', 'Luis', 'VENDEDOR', 980])
    const attendance = source.addWorksheet('BIOMETRICO')
    attendance.addRow(['CEDULA', 'NOMBRE'])
    attendance.addRow(['100', 'Ana García'])

    const buffer = await source.xlsx.writeBuffer()
    const file = new File([new Uint8Array(buffer)], 'nomina.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const result = await loadPayrollWorkbook(file)

    expect(result.sheets.map((sheet) => sheet.name)).toEqual(['NOMINA', 'BIOMETRICO'])
    expect(result.sheets[0].headerRowNumber).toBe(4)
    expect(result.sheets[0].rows).toHaveLength(2)
    expect(result.sheets[0].rows[1]['NOMBRE']).toBe('Luis')
    expect(result.sheets[1].rows).toHaveLength(1)
  })

  it('rejects non-Excel file extensions', async () => {
    const file = new File(['not excel'], 'nomina.csv')
    await expect(loadPayrollWorkbook(file)).rejects.toThrow('formato .xlsx')
  })

  it('exports edited cells without dropping other sheets', async () => {
    const source = new ExcelJS.Workbook()
    const payroll = source.addWorksheet('NOMINA')
    payroll.addRow(['CÉDULA', 'BONO', 'TOTAL A PAGAR', 'CANTIDAD RECIBIDA EN BS'])
    payroll.addRow(['100', 20, 120, 0])
    source.addWorksheet('PROVEEDORES').addRow(['Proveedor', 'Factura'])

    const buffer = await source.xlsx.writeBuffer()
    const file = new File([new Uint8Array(buffer)], 'nomina.xlsx')
    const loaded = await loadPayrollWorkbook(file)
    const blob = await exportEditedWorkbook(loaded, [
      { sheetName: 'NOMINA', rowNumber: 2, columnNumber: 2, value: 35 },
      { sheetName: 'NOMINA', rowNumber: 2, columnNumber: 4, value: 1234.56 },
    ])
    const exported = new ExcelJS.Workbook()
    await exported.xlsx.load(await blob.arrayBuffer())
    const exportedZip = await JSZip.loadAsync(await blob.arrayBuffer())
    const exportedMetadata = await exportedZip.file('xl/workbook.xml')?.async('text')

    expect(exported.worksheets.map((sheet) => sheet.name)).toEqual(['NOMINA', 'PROVEEDORES'])
    expect(exported.getWorksheet('NOMINA')?.getCell('B2').value).toBe(35)
    expect(exported.getWorksheet('NOMINA')?.getCell('C2').value).toBe(120)
    expect(exported.getWorksheet('NOMINA')?.getCell('D2').value).toBe(1234.56)
    expect(exportedMetadata).toContain('fullCalcOnLoad="1"')
  })

  it('accepts localized amounts in payroll and bolívar columns', () => {
    expect(isNumericPayrollField('CANTIDAD RECIBIDA EN BS', null)).toBe(true)
    expect(isNumericPayrollField('BONO', null)).toBe(true)
    expect(parsePayrollCellEdit('1.234,56', null, 'CANTIDAD RECIBIDA EN BS')).toBe(1234.56)
    expect(parsePayrollCellEdit('98,75', 0, 'BONO')).toBe(98.75)
    expect(parsePayrollCellEdit('1,234.56', null, 'TOTAL A PAGAR')).toBe(1234.56)
    expect(() => parsePayrollCellEdit('monto inválido', null, 'CANTIDAD RECIBIDA EN BS'))
      .toThrow('escribe un monto válido')
  })

  it('keeps date columns editable as dates instead of amounts', () => {
    expect(isDatePayrollField('FECHA DE INGRESO', null)).toBe(true)
    expect(isNumericPayrollField('FECHA DE INGRESO', null)).toBe(false)
    const edited = parsePayrollCellEdit('2026-11-09', null, 'FECHA DE INGRESO')
    expect(edited).toBeInstanceOf(Date)
    expect(edited instanceof Date ? edited.toISOString().startsWith('2026-11-09') : false).toBe(true)
  })

  it('normalizes Spanish labels and formats values for display', () => {
    expect(normalizeText('CÉDULA   V-')).toBe('cedula v-')
    expect(formatCellValue(1250.5)).toBe('1.250,5')
    expect(formatCellValue(null)).toBe('')
  })
})

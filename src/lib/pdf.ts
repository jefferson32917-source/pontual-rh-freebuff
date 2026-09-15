import { jsPDF } from 'jspdf'
import type { PayrollRun } from '../types'

function money(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function referenceLabel(ref: string): string {
  const [y, m] = ref.split('-').map(Number)
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${months[(m ?? 1) - 1]} de ${y}`
}

function referenceShort(ref: string): string {
  const [y, m] = ref.split('-').map(Number)
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[(m ?? 1) - 1]}/${y}`
}

interface Row {
  code: string
  label: string
  ref: string
  credit?: number
  debit?: number
}

function buildRows(run: PayrollRun): Row[] {
  const rows: Row[] = [{ code: '001', label: 'Salário base', ref: '220h', credit: run.baseSalary }]
  if (run.extraHours > 0) {
    rows.push({ code: '020', label: 'Horas extras', ref: `${run.extraHours}h × ${money(run.extraHoursRate)}`, credit: Math.round(run.extraHours * run.extraHoursRate * 100) / 100 })
  }
  for (const item of run.items.filter((i) => i.amount > 0)) {
    rows.push({ code: '099', label: `Benefício Extra — ${item.label}`, ref: '', credit: item.amount })
  }
  if (run.familyAllowance > 0) {
    rows.push({ code: '110', label: 'Salário-família', ref: String(run.employee.dependents), credit: run.familyAllowance })
  }
  rows.push({ code: '501', label: 'INSS', ref: `Base: ${money(run.inssBase)}`, debit: run.inss })
  rows.push({ code: '503', label: 'IRRF', ref: `Base: ${money(run.irrfBase)}`, debit: run.irrf })
  if (run.transportDeduction > 0) {
    rows.push({ code: '520', label: 'Vale-transporte (VT)', ref: `6% × ${money(run.baseSalary)}`, debit: run.transportDeduction })
  }
  for (const item of run.items.filter((i) => i.amount < 0)) {
    rows.push({ code: '599', label: item.label, ref: '', debit: Math.abs(item.amount) })
  }
  return rows
}

/** Cor da marca em hex -> RGB para o jsPDF. */
function brand(): [number, number, number] {
  return [37, 99, 235] // #2563EB
}

/**
 * Gera o holerite em PDF (A4) e baixa diretamente no dispositivo,
 * sem depender de pop-ups ou da caixa de impressão.
 */
export function downloadPayrollPdf(run: PayrollRun): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14 // margem
  const blue = brand()
  const ink: [number, number, number] = [30, 41, 59]

  const rows = buildRows(run)
  const totalProventos = Math.round((run.gross + run.familyAllowance) * 100) / 100
  const totalDescontos = Math.round((run.inss + run.irrf + run.otherDeductions) * 100) / 100

  // ============ Cabeçalho da empresa ============
  doc.setFillColor(...blue)
  doc.rect(0, 0, W, 26, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(run.company.name.toUpperCase(), W / 2, 11, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  const head2 = `CNPJ: ${run.company.cnpj || '—'}${run.company.stateRegistration ? `  ·  IE: ${run.company.stateRegistration}` : ''}`
  doc.text(head2, W / 2, 16.5, { align: 'center' })
  const addrLine = [run.company.address, run.company.bairro, run.company.city ? `${run.company.city}${run.company.uf ? '/' + run.company.uf : ''}` : '', run.company.cep ? `CEP ${run.company.cep}` : ''].filter(Boolean).join(' · ')
  if (addrLine) doc.text(addrLine, W / 2, 21, { align: 'center' })

  // ============ Título ============
  doc.setFillColor(239, 246, 255)
  doc.rect(0, 26, W, 8, 'F')
  doc.setTextColor(...blue)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('DEMONSTRATIVO DE PAGAMENTO', W / 2, 31.5, { align: 'center' })

  // ============ Dados do empregado ============
  let y = 40
  doc.setTextColor(...ink)
  const empRows: [string, string, string, string][] = [
    ['Empresa:', run.company.name, 'Competência:', referenceLabel(run.reference)],
    ['Empregado:', run.employee.name, 'Matrícula:', run.employee.matricula],
    ['Cargo:', run.employee.jobTitle, 'Deptº:', run.employee.department],
    ['CTPS:', run.employee.ctps || '—', 'CPF:', run.employee.cpf || '—'],
    ['Admissão:', run.employee.admissionDate.split('-').reverse().join('/'), 'Dependentes:', String(run.employee.dependents)],
  ]
  if (run.employee.phone || run.employee.address) {
    empRows.push([
      'Telefone:', run.employee.phone || '—',
      'Endereço:', run.employee.address ? `${run.employee.address}${run.employee.cep ? ` · CEP ${run.employee.cep}` : ''}` : '—',
    ])
  }
  doc.setFontSize(8.5)
  for (const [k1, v1, k2, v2] of empRows) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139)
    doc.text(k1, M, y)
    doc.text(k2, W / 2 + 4, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...ink)
    doc.text(v1.slice(0, 52), M + 24, y)
    doc.text(v2.slice(0, 52), W / 2 + 34, y)
    y += 6
  }

  // ============ Tabela de verbas ============
  y += 3
  const colX: [number, number, number, number] = [M, M + 88, W / 2 - 6, W / 2 + 30]
  doc.setFillColor(...blue)
  doc.rect(M, y, W - 2 * M, 7, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('VERBAS', colX[0] + 2, y + 4.8)
  doc.text('REFERÊNCIA', colX[1] + 2, y + 4.8)
  doc.text('VENCIMENTOS', colX[2] + 2, y + 4.8)
  doc.text('DESCONTOS', colX[3] + 2, y + 4.8)
  y += 7

  doc.setFontSize(8.5)
  for (const row of rows) {
    doc.setDrawColor(241, 245, 249)
    doc.line(M, y + 4.5, W - M, y + 4.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...ink)
    doc.setFont('helvetica', 'bold')
    doc.text(row.code, colX[0] + 2, y + 3.6)
    doc.setFont('helvetica', 'normal')
    doc.text(row.label.slice(0, 46), colX[0] + 14, y + 3.6)
    doc.text(row.ref, colX[1] + 2, y + 3.6)
    if (row.credit != null) doc.text(money(row.credit), colX[2] + 2, y + 3.6)
    if (row.debit != null) doc.text(money(row.debit), colX[3] + 2, y + 3.6)
    y += 7
  }

  // Totais
  doc.setFillColor(248, 250, 252)
  doc.rect(M, y, W - 2 * M, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAIS', colX[0] + 2, y + 4.8)
  doc.text(money(totalProventos), colX[2] + 2, y + 4.8)
  doc.text(money(totalDescontos), colX[3] + 2, y + 4.8)
  y += 7

  // Líquido
  doc.setFillColor(239, 246, 255)
  doc.rect(M, y, W - 2 * M, 10, 'F')
  doc.setFillColor(...blue)
  doc.rect(M, y, W - 2 * M, 0.8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(30, 58, 138)
  doc.text('VALOR LÍQUIDO', M + 2, y + 6.5)
  doc.setFontSize(13)
  doc.text(money(run.netPay), W - M - 2, y + 6.8, { align: 'right' })
  y += 16

  // FGTS informativo (eSocial: custo do empregador, não desconta do empregado)
  const faixaIrrfNote = run.irrf > 0 ? `${Math.round(((run.irrf + (run.irrfBase > 4664.68 ? 908.73 : 0)) / run.irrfBase) * 100)}%` : 'Isento'
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text(
    `FGTS do mês: ${money(run.fgts)} (base ${money(run.fgtsBase)}) — recolhimento do empregador, não descontado do empregado · Faixa IRRF: ${faixaIrrfNote}`,
    M,
    y + 2,
  )
  y += 8

  // ============ Assinatura ============
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text('Recebi o valor líquido acima descrito em ____/____/________', M, y + 3)
  doc.text('Assinatura: ________________________________', W - M - 70, y + 3)
  y += 12

  // ============ Rodapé de bases ============
  const faixaIrrf = run.irrf > 0 ? `${Math.round(((run.irrf + (run.irrfBase > 4664.68 ? 908.73 : 0)) / run.irrfBase) * 100)}%` : 'Isento'
  const bases: [string, string][] = [
    ['SALÁRIO BASE', money(run.baseSalary)],
    ['SAL. CONTR. INSS', money(run.inssBase)],
    ['BASE CÁLC. FGTS', money(run.fgtsBase)],
    ['FGTS DO MÊS', money(run.fgts)],
    ['BASE CÁLC. IRRF', money(run.irrfBase)],
    ['FAIXA IRRF', faixaIrrf],
  ]
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(M, y, W - M, y)
  doc.setLineWidth(0.2)
  const colW = (W - 2 * M) / bases.length
  bases.forEach(([label, value], i) => {
    const x = M + i * colW
    if (i > 0) {
      doc.setDrawColor(241, 245, 249)
      doc.line(x, y + 1.5, x, y + 13)
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(100, 116, 139)
    doc.text(label, x + colW / 2, y + 5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...ink)
    doc.text(value, x + colW / 2, y + 10.5, { align: 'center' })
  })

  // Nota de rodapé
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(148, 163, 184)
  doc.text(
    `Documento gerado eletronicamente por Pontual RH Super · ${referenceShort(run.reference)} · v${run.version} · ${new Date().toLocaleString('pt-BR')}`,
    W / 2,
    doc.internal.pageSize.getHeight() - 8,
    { align: 'center' },
  )

  const fileName = `holerite_${run.employee.matricula}_${run.reference}_v${run.version}.pdf`
  doc.save(fileName)
}

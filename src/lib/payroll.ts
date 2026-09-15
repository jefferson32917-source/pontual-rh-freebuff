import type { PayrollItem, User } from '../types'

/**
 * Gerador de folha de pagamento — parâmetros CLT vigentes (vigos 2025, lei 14.973/2024).
 *
 * INSS (fórmula progressiva, teto contribuição: R$ 951,63):
 *   até 1.518,00        -> 7,5%
 *   1.518,01–2.793,88   -> 9%
 *   2.793,89–4.190,83   -> 12%
 *   4.190,84–8.157,41   -> 14%
 * Acima do teto: contribuição fixa de R$ 951,63 (o desconto do empregado nunca passa disso).
 *
 * IRRF (tabela mensal a partir de 05/2025):
 *   até 2.428,80     -> isento
 *   2.428,81–2.826,65   -> 7,5%  (deduz 182,16)
 *   2.826,66–3.751,05   -> 15%   (deduz 394,16)
 *   3.751,06–4.664,68   -> 22,5% (deduz 675,49)
 *   acima de 4.664,68   -> 27,5% (deduz 908,73)
 * Desconto simplificado opcional (o que for mais vantajoso): R$ 607,20.
 * Dedução por dependente: R$ 189,59.
 *
 * FGTS do empregador: 8% (informativo, não desconta do empregado).
 * Horas extras: valor da hora + 50% mínimo (configurável).
 * Salário-família (2025): R$ 26,44 por dependente p/ quem ganha até R$ 1.906,04.
 */

export const PAYROLL_PARAMS = {
  inssBrackets: [
    { ceiling: 1518.0, rate: 0.075 },
    { ceiling: 2793.88, rate: 0.09 },
    { ceiling: 4190.83, rate: 0.12 },
    { ceiling: 8157.41, rate: 0.14 },
  ],
  inssCeilingContribution: 951.63,
  irrfBrackets: [
    { ceiling: 2428.8, rate: 0, deduction: 0 },
    { ceiling: 2826.65, rate: 0.075, deduction: 182.16 },
    { ceiling: 3751.05, rate: 0.15, deduction: 394.16 },
    { ceiling: 4664.68, rate: 0.225, deduction: 675.49 },
    { ceiling: Infinity, rate: 0.275, deduction: 908.73 },
  ],
  irrfSimplifiedDeduction: 607.2,
  dependentDeduction: 189.59,
  fgtsRate: 0.08,
  transportAllowanceRate: 0.06,
  extraHoursPremium: 0.5,
  familyAllowance: { value: 26.44, ceiling: 1906.04 },
}

export interface PayrollResult {
  baseSalary: number
  items: PayrollItem[]
  extraHours: number
  extraHoursRate: number
  extraHoursTotal: number
  gross: number
  inssBase: number
  inss: number
  irrfBase: number
  irrf: number
  fgtsBase: number
  fgts: number
  transportDeduction: number
  familyAllowance: number
  otherDeductions: number
  netPay: number
}

function calculateINSS(gross: number): number {
  if (gross > PAYROLL_PARAMS.inssBrackets[PAYROLL_PARAMS.inssBrackets.length - 1]!.ceiling) {
    return PAYROLL_PARAMS.inssCeilingContribution
  }
  let remaining = gross
  let previous = 0
  let contribution = 0
  for (const bracket of PAYROLL_PARAMS.inssBrackets) {
    const slice = Math.min(remaining, bracket.ceiling - previous)
    if (slice <= 0) break
    contribution += slice * bracket.rate
    remaining -= slice
    previous = bracket.ceiling
  }
  return Math.min(contribution, PAYROLL_PARAMS.inssCeilingContribution)
}

function calculateIRRF(base: number, dependents: number): { base: number; tax: number } {
  const irrfBase = Math.max(0, base - dependents * PAYROLL_PARAMS.dependentDeduction)
  const bracket =
    PAYROLL_PARAMS.irrfBrackets.find((b) => irrfBase <= b.ceiling) ??
    PAYROLL_PARAMS.irrfBrackets[PAYROLL_PARAMS.irrfBrackets.length - 1]!
  const progressive = Math.max(0, irrfBase * bracket.rate - bracket.deduction)
  // Desconto simplificado: deduz 607,20 da base em vez das deduções legais
  const simplifiedBase = Math.max(0, base - PAYROLL_PARAMS.irrfSimplifiedDeduction)
  const simplifiedTax = simplifiedBase <= PAYROLL_PARAMS.irrfBrackets[0]!.ceiling ? 0 : progressive
  const tax = Math.min(progressive, simplifiedTax)
  return { base: irrfBase, tax: Math.round(tax * 100) / 100 }
}

export function calculatePayroll(
  user: Pick<User, 'baseSalary' | 'transportAllowance' | 'dependents' | 'alimonyPercent'>,
  options: {
    items: PayrollItem[]
    extraHours: number
    monthlyHours?: number
  },
): PayrollResult {
  const monthlyHours = options.monthlyHours ?? 220
  const baseSalary = user.baseSalary
  const hourValue = baseSalary / monthlyHours
  const extraHoursRate = hourValue * (1 + PAYROLL_PARAMS.extraHoursPremium)
  const extraHoursTotal = Math.round(options.extraHours * extraHoursRate * 100) / 100

  const positiveItems = options.items.filter((i) => i.amount > 0)
  const negativeItems = options.items.filter((i) => i.amount < 0)
  const bonusTotal = positiveItems.reduce((acc, i) => acc + i.amount, 0)

  const gross = Math.round((baseSalary + extraHoursTotal + bonusTotal) * 100) / 100

  const inss = Math.round(calculateINSS(gross) * 100) / 100
  const alimony = Math.round(gross * (user.alimonyPercent / 100) * 100) / 100
  const directDeductions = Math.abs(negativeItems.reduce((acc, i) => acc + i.amount, 0))

  const { base: irrfBase, tax: irrf } = calculateIRRF(gross - inss, user.dependents)

  const transportDeduction = user.transportAllowance
    ? Math.round(baseSalary * PAYROLL_PARAMS.transportAllowanceRate * 100) / 100
    : 0

  const familyAllowance =
    user.dependents > 0 && gross <= PAYROLL_PARAMS.familyAllowance.ceiling
      ? user.dependents * PAYROLL_PARAMS.familyAllowance.value
      : 0

  const otherDeductions = Math.round((directDeductions + alimony + transportDeduction) * 100) / 100

  const netPay =
    Math.round((gross - inss - irrf - otherDeductions + familyAllowance) * 100) / 100

  const fgts = Math.round(gross * PAYROLL_PARAMS.fgtsRate * 100) / 100

  return {
    baseSalary,
    items: options.items,
    extraHours: options.extraHours,
    extraHoursRate,
    extraHoursTotal,
    gross,
    inssBase: gross,
    inss,
    irrfBase,
    irrf,
    fgtsBase: gross,
    fgts,
    transportDeduction,
    familyAllowance,
    otherDeductions,
    netPay,
  }
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

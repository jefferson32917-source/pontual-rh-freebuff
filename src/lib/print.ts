import type { PayrollRun } from '../types'
import { referenceShortLabel } from './format'

function esc(s: string | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Abre o holerite em uma JANELA DEDICADA com apenas o documento impresso
 * (mesma renderização do PDF) e dispara a impressão. Evita os problemas do
 * window.print() direto na SPA (tela branca / segunda página em branco),
 * porque a janela de impressão contém somente o holerite — sem app, sem
 * segunda página, sem dependência de CSS da aplicação.
 */
export function printPayroll(run: PayrollRun): void {
  const win = window.open('', '_blank', 'width=860,height=1000')
  if (!win) {
    alert('Permita pop-ups para imprimir o holerite.')
    return
  }

  const rows: { code: string; label: string; ref: string; credit?: string; debit?: string }[] = [
    { code: '001', label: 'Salário base', ref: '220h', credit: money(run.baseSalary) },
  ]
  if (run.extraHours > 0) {
    rows.push({ code: '020', label: 'Horas extras', ref: `${run.extraHours}h × ${money(run.extraHoursRate)}`, credit: money(run.extraHours * run.extraHoursRate) })
  }
  for (const item of run.items.filter((i) => i.amount > 0)) {
    rows.push({ code: '099', label: `Benefício Extra — ${item.label}`, ref: '', credit: money(item.amount) })
  }
  if (run.familyAllowance > 0) {
    rows.push({ code: '110', label: 'Salário-família', ref: String(run.employee.dependents), credit: money(run.familyAllowance) })
  }
  rows.push({ code: '501', label: 'INSS', ref: `Base: ${money(run.inssBase)}`, debit: money(run.inss) })
  rows.push({ code: '503', label: 'IRRF', ref: `Base: ${money(run.irrfBase)}`, debit: money(run.irrf) })
  if (run.transportDeduction > 0) {
    rows.push({ code: '520', label: 'Vale-transporte (VT)', ref: `6% × ${money(run.baseSalary)}`, debit: money(run.transportDeduction) })
  }
  for (const item of run.items.filter((i) => i.amount < 0)) {
    rows.push({ code: '599', label: item.label, ref: '', debit: money(Math.abs(item.amount)) })
  }

  const totalProventos = money(run.gross + run.familyAllowance)
  const totalDescontos = money(run.inss + run.irrf + run.otherDeductions)
  const faixaIrrf = run.irrf > 0 ? `${Math.round(((run.irrf + (run.irrfBase > 4664.68 ? 908.73 : 0)) / run.irrfBase) * 100)}%` : 'Isento'
  const c = run.company
  const addrLine = [c.address, c.bairro, c.city ? `${c.city}${c.uf ? '/' + c.uf : ''}` : '', c.cep ? `CEP ${c.cep}` : ''].filter(Boolean).join(' · ')

  const bodyRows = rows
    .map(
      (r) => `<tr>
        <td><b class="code">${r.code}</b> ${esc(r.label)}</td>
        <td class="r">${esc(r.ref)}</td>
        <td class="r v">${r.credit ?? ''}</td>
        <td class="r v neg">${r.debit ?? ''}</td>
      </tr>`,
    )
    .join('')

  win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Holerite ${esc(run.employee.matricula)} — ${referenceShortLabel(run.reference)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; color: #1e293b; }
  .sheet { max-width: 780px; margin: 20px auto; border: 2px solid #2563eb; border-radius: 10px; overflow: hidden; }
  .head { text-align: center; background: #2563eb; color: #fff; padding: 14px 16px 10px; }
  .head h1 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.02em; }
  .head .sub { font-size: 10px; opacity: 0.9; margin-top: 3px; }
  .title { text-align: center; font-weight: 700; font-size: 11.5px; color: #1d4ed8; background: #eff6ff; padding: 7px 0; }
  table { width: 100%; border-collapse: collapse; }
  .meta { font-size: 11px; }
  .meta td { padding: 5px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .meta .k { font-weight: 700; color: #64748b; white-space: nowrap; background: #f8fafc; border-right: 1px solid #f1f5f9; }
  .main { font-size: 11.5px; }
  .main thead th { background: #2563eb; color: #fff; text-align: left; padding: 6px 10px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; border-right: 1px solid rgba(255,255,255,0.15); }
  .main thead th:last-child { border-right: none; }
  .main td { padding: 5px 10px; border-bottom: 1px solid #f1f5f9; border-right: 1px solid #f8fafc; }
  .main td:last-child { border-right: none; }
  .r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .v { font-weight: 600; }
  .neg { color: #dc2626; }
  .code { font-family: ui-monospace, monospace; font-size: 9.5px; color: #94a3b8; }
  .totals td { background: #f8fafc; font-weight: 700; border-top: 2px solid #e2e8f0; }
  .netrow td { background: #eff6ff; border-top: 2px solid #2563eb; }
  .netlabel { font-weight: 800; color: #1e3a8a; text-transform: uppercase; font-size: 11px; }
  .netvalue { font-weight: 800; font-size: 15px; color: #1e3a8a; }
  .sign { display: flex; justify-content: space-between; gap: 24px; padding: 14px 12px 8px; font-size: 10px; color: #475569; }
  .fgts-note { padding: 6px 12px; font-size: 9.5px; color: #475569; background: #f8fafc; border-top: 1px solid #e2e8f0; line-height: 1.6; }
  .foot { border-top: 2px solid #e2e8f0; font-size: 9px; }
  .foot td { padding: 7px 6px; text-align: center; color: #334155; border-right: 1px solid #f1f5f9; line-height: 1.5; }
  .foot td:last-child { border-right: none; }
  .foot b { display: block; font-size: 8px; text-transform: uppercase; color: #64748b; letter-spacing: 0.03em; }
  .gen { text-align: center; font-size: 8.5px; color: #94a3b8; padding: 10px 0 14px; }
  /* Impressão: exatamente 1 página com o holerite inteiro */
  @page { size: A4; margin: 10mm; }
  @media print {
    body { margin: 0; }
    .sheet { margin: 0 auto; border-radius: 6px; max-width: 100%; }
    .gen { padding-bottom: 0; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <h1>${esc(c.name)}</h1>
      <div class="sub">CNPJ: ${esc(c.cnpj) || '—'}${c.stateRegistration ? ` &nbsp;·&nbsp; IE: ${esc(c.stateRegistration)}` : ''}</div>
      ${addrLine ? `<div class="sub">${esc(addrLine)}</div>` : ''}
    </div>
    <div class="title">DEMONSTRATIVO DE PAGAMENTO</div>
    <table class="meta"><tbody>
      <tr><td class="k">Empresa:</td><td>${esc(c.name)}</td><td class="k">Competência:</td><td><b>${referenceShortLabel(run.reference)}</b></td></tr>
      <tr><td class="k">Empregado:</td><td><b>${esc(run.employee.name)}</b></td><td class="k">Matrícula:</td><td>${esc(run.employee.matricula)}</td></tr>
      <tr><td class="k">Cargo:</td><td>${esc(run.employee.jobTitle)}</td><td class="k">Deptº:</td><td>${esc(run.employee.department)}</td></tr>
      <tr><td class="k">CTPS:</td><td>${esc(run.employee.ctps) || '—'}</td><td class="k">CPF:</td><td>${esc(run.employee.cpf) || '—'}</td></tr>
      <tr><td class="k">Admissão:</td><td>${esc(run.employee.admissionDate)}</td><td class="k">Dependentes:</td><td>${run.employee.dependents}</td></tr>
      ${run.employee.phone || run.employee.address ? `<tr><td class="k">Telefone:</td><td>${esc(run.employee.phone) || '—'}</td><td class="k">Endereço:</td><td>${esc(run.employee.address) || '—'}${run.employee.cep ? ` · CEP ${esc(run.employee.cep)}` : ''}</td></tr>` : ''}
    </tbody></table>
    <table class="main"><thead>
      <tr><th style="width:42%">Proventos / Verbas</th><th style="width:18%">Referência</th><th style="width:20%">Proventos</th><th style="width:20%">Descontos</th></tr>
    </thead><tbody>
      ${bodyRows}
      <tr class="totals"><td colspan="2">TOTAIS</td><td class="r">${totalProventos}</td><td class="r">${totalDescontos}</td></tr>
      <tr class="netrow"><td colspan="2" class="netlabel">Valor líquido</td><td colspan="2" class="r netvalue">${money(run.netPay)}</td></tr>
    </tbody></table>
    <p class="fgts-note"><b>FGTS do mês:</b> ${money(run.fgts)} (base ${money(run.fgtsBase)}) — recolhimento do empregador, não descontado do empregado · <b>Faixa IRRF:</b> ${faixaIrrf}</p>
    <div class="sign">
      <span>Recebi o valor líquido acima descrito em ____/____/________</span>
      <span>Assinatura: ________________________________</span>
    </div>
    <table class="foot"><tbody>
      <tr>
        <td><b>Salário Base</b>${money(run.baseSalary)}</td>
        <td><b>Sal. Contr. INSS</b>${money(run.inssBase)}</td>
        <td><b>Base Cálc. FGTS</b>${money(run.fgtsBase)}</td>
        <td><b>FGTS do Mês</b>${money(run.fgts)}</td>
        <td><b>Base Cálc. IRRF</b>${money(run.irrfBase)}</td>
        <td><b>Faixa IRRF</b>${faixaIrrf}</td>
      </tr>
    </tbody></table>
  </div>
  <p class="gen">Documento gerado eletronicamente por Pontual RH Super · v${run.version} · ${new Date().toLocaleString('pt-BR')}</p>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
    };
  <\/script>
</body>
</html>`)
  win.document.close()
}

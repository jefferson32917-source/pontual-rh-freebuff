import type { PayrollRun } from '../types'
import { formatBRL } from '../lib/payroll'
import { referenceShortLabel } from '../lib/format'

/**
 * Holerite visual compartilhado — modelo clássico alinhado a CLT/eSocial:
 * campos obrigatórios Empresa, Empregado, Competência, Proventos, Descontos,
 * FGTS e Valor Líquido; bases de INSS/IRRF exibidas; FGTS e VT como
 * informativos/rubricas; itens variáveis codificados como Benefício Extra (099).
 */
export default function HoleriteSheet({ run, id = 'holerite-sheet' }: { run: PayrollRun; id?: string }) {
  const totalProventos = run.gross + run.familyAllowance
  const totalDescontos = run.inss + run.irrf + run.otherDeductions
  const faixaIrrf =
    run.irrf > 0
      ? `${Math.round(((run.irrf + (run.irrfBase > 4664.68 ? 908.73 : 0)) / run.irrfBase) * 100)}%`
      : 'Isento'
  const c = run.company
  const benefits = run.items.filter((i) => i.amount > 0)

  return (
    <div className="holerite card" id={id}>
      <div className="holerite-head">
        <p className="holerite-company">{c.name}</p>
        <p className="holerite-sub">
          CNPJ: {c.cnpj || '—'}
          {c.stateRegistration ? ` · IE: ${c.stateRegistration}` : ''}
        </p>
        {(c.address || c.city) && (
          <p className="holerite-sub">
            {[c.address, c.bairro, c.city ? `${c.city}${c.uf ? '/' + c.uf : ''}` : '', c.cep ? `CEP ${c.cep}` : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>
      <p className="holerite-title">Demonstrativo de Pagamento</p>
      <table className="holerite-meta"><tbody>
        <tr>
          <td className="k">Empresa:</td><td>{c.name}</td>
          <td className="k">Competência:</td><td>{referenceShortLabel(run.reference)}</td>
        </tr>
        <tr>
          <td className="k">Empregado:</td><td>{run.employee.name}</td>
          <td className="k">Matrícula:</td><td>{run.employee.matricula}</td>
        </tr>
        <tr>
          <td className="k">Cargo:</td><td>{run.employee.jobTitle}</td>
          <td className="k">Deptº:</td><td>{run.employee.department}</td>
        </tr>
        <tr>
          <td className="k">CTPS:</td><td>{run.employee.ctps || '—'}</td>
          <td className="k">CPF:</td><td>{run.employee.cpf || '—'}</td>
        </tr>
        <tr>
          <td className="k">Admissão:</td><td>{run.employee.admissionDate.split('-').reverse().join('/')}</td>
          <td className="k">Dependentes:</td><td>{run.employee.dependents}</td>
        </tr>
      </tbody></table>
      {(run.employee.phone || run.employee.address) && (
        <table className="holerite-meta"><tbody>
          <tr>
            {run.employee.phone && (<>
              <td className="k">Telefone:</td><td>{run.employee.phone}</td>
            </>)}
            {run.employee.address && (<>
              <td className="k">Endereço:</td><td>{run.employee.address}{run.employee.cep ? ` · CEP ${run.employee.cep}` : ''}</td>
            </>)}
          </tr>
        </tbody></table>
      )}
      <table className="holerite-main"><thead>
        <tr>
          <th className="w-45">Proventos / Verbas</th><th className="w-15">Referência</th><th className="w-20">Proventos</th><th className="w-20">Descontos</th>
        </tr>
      </thead><tbody>
        <tr><td>001 Salário base</td><td className="r">220</td><td className="r">{formatBRL(run.baseSalary)}</td><td></td></tr>
        {run.extraHours > 0 && (
          <tr><td>020 Horas extras</td><td className="r">{run.extraHours}h × {formatBRL(run.extraHoursRate)}</td><td className="r">{formatBRL(run.extraHours * run.extraHoursRate)}</td><td></td></tr>
        )}
        {benefits.map((item) => (
          <tr key={item.id}><td>099 Benefício Extra — {item.label}</td><td></td><td className="r">{formatBRL(item.amount)}</td><td></td></tr>
        ))}
        {run.familyAllowance > 0 && (
          <tr><td>110 Salário-família</td><td className="r">{run.employee.dependents}</td><td className="r">{formatBRL(run.familyAllowance)}</td><td></td></tr>
        )}
        <tr><td>501 INSS</td><td className="r">Base: {formatBRL(run.inssBase)}</td><td></td><td className="r">{formatBRL(run.inss)}</td></tr>
        <tr><td>503 IRRF</td><td className="r">Base: {formatBRL(run.irrfBase)}</td><td></td><td className="r">{formatBRL(run.irrf)}</td></tr>
        {run.transportDeduction > 0 && (
          <tr><td>520 Vale-transporte (VT)</td><td className="r">6% × {formatBRL(run.baseSalary)}</td><td></td><td className="r">{formatBRL(run.transportDeduction)}</td></tr>
        )}
        {run.items.filter((i) => i.amount < 0).map((item) => (
          <tr key={item.id}><td>599 {item.label}</td><td></td><td></td><td className="r">{formatBRL(Math.abs(item.amount))}</td></tr>
        ))}
        <tr className="totals">
          <td colSpan={2}>Totais</td>
          <td className="r">{formatBRL(totalProventos)}</td>
          <td className="r">{formatBRL(totalDescontos)}</td>
        </tr>
        <tr className="netrow">
          <td colSpan={2} className="netlabel">Valor líquido</td>
          <td colSpan={2} className="r netvalue">{formatBRL(run.netPay)}</td>
        </tr>
      </tbody></table>
      {/* FGTS — informativo (custo do empregador, não desconta do empregado) */}
      <p className="fgts-note">
        <strong>FGTS do mês:</strong> {formatBRL(run.fgts)} (base {formatBRL(run.fgtsBase)}) — recolhimento do empregador, não descontado do empregado · <strong>Faixa IRRF:</strong> {faixaIrrf}
      </p>
      <div className="holerite-sign">
        <span>Recebi o valor líquido acima descrito em ___/___/______</span>
        <span className="sigline">Assinatura: ______________________</span>
      </div>
      <table className="holerite-footer"><tbody>
        <tr>
          <td><b>Salário Base</b><br />{formatBRL(run.baseSalary)}</td>
          <td><b>Sal. Contr. INSS</b><br />{formatBRL(run.inssBase)}</td>
          <td><b>Base Cálc. FGTS</b><br />{formatBRL(run.fgtsBase)}</td>
          <td><b>FGTS do Mês</b><br />{formatBRL(run.fgts)}</td>
          <td><b>Base Cálc. IRRF</b><br />{formatBRL(run.irrfBase)}</td>
          <td><b>Faixa IRRF</b><br />{faixaIrrf}</td>
        </tr>
      </tbody></table>
      <p className="px-4 pb-3 pt-2 text-center text-[9.5px] text-slate-400">
        Documento gerado eletronicamente por Pontual RH Super · v{run.version} · {new Date(run.generatedAt).toLocaleString('pt-BR')}
      </p>
    </div>
  )
}

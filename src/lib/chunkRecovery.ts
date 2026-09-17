/**
 * Recuperação automática de chunk obsoleto ("Failed to fetch dynamically
 * imported module").
 *
 * Cenário: novo deploy na Vercel troca os assets com hash; uma aba aberta
 * na versão antiga tenta carregar um chunk que não existe mais (404).
 *
 * Estratégia: no PRIMEIRO erro desse tipo por sessão de página, grava uma
 * flag em sessionStorage e recarrega a página — a versão nova entra e
 * tudo volta a funcionar sem o usuário precisar dar Ctrl+F5.
 * A flag impede loop infinito (se recarregar e falhar de novo, o erro
 * aparece normal — geralmente é rede/offline, não deploy).
 */

const FLAG = 'pontual.chunkReload'

/** Instala listeners globais que detectam falha de chunk e recarregam 1x. */
export function installChunkRecovery(): void {
  const staleChunk = (msg: string): boolean =>
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
      msg,
    )

  window.addEventListener('error', (e) => {
    const target = e.target as HTMLElement | null
    // <script>/<link> quebrados contam como resource error (não tem message)
    if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      maybeReload()
    }
  }, true)

  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? '')
    if (staleChunk(msg)) maybeReload()
  })

  function maybeReload(): void {
    try {
      if (sessionStorage.getItem(FLAG)) return // já tentamos uma vez
      sessionStorage.setItem(FLAG, '1')
      // preserva a rota atual: recarrega na mesma URL
      window.location.reload()
    } catch {
      /* storage indisponível: não recarrega em loop */
    }
  }

  // limpa a flag quando o app carrega COMPLETO e saudável: um deploy
  // futuro pode precisar de um novo reload
  window.addEventListener('load', () => {
    // só limpa se a página carregou sem erros imediatos
    window.setTimeout(() => {
      try {
        sessionStorage.removeItem(FLAG)
      } catch {
        /* ignore */
      }
    }, 5000)
  })
}

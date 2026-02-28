/*
 * ===== playwright.config.js =====
 * Configuração dos TESTES E2E (End-to-End) com Playwright.
 *
 * O QUE SÃO TESTES E2E?
 * Testes End-to-End simulam um utilizador REAL a usar a aplicação:
 * - Abrem um browser verdadeiro (Chromium)
 * - Navegam para a página
 * - Clicam em botões, preenchem formulários
 * - Verificam que o resultado está correto
 *
 * O QUE É PLAYWRIGHT?
 * Playwright é uma ferramenta da Microsoft para testes automáticos de browser.
 * Suporta Chromium, Firefox e WebKit.
 *
 * COMO CORRER:
 * npm test          → corre os testes na consola
 * npm run test:ui   → abre a interface gráfica do Playwright
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Pasta onde estão os ficheiros de teste
  testDir: './e2e',

  // Correr testes em paralelo (mais rápido)
  fullyParallel: true,

  // Em CI (Continuous Integration), proibir .only (evita testes esquecidos)
  // process.env.CI é uma variável de ambiente definida em pipelines de CI/CD
  forbidOnly: !!process.env.CI,

  // Número de retentativas quando um teste falha
  // Em CI: 2 retentativas; Localmente: 0 (falha é imediata)
  retries: process.env.CI ? 2 : 0,

  // Número de workers (processos paralelos)
  // Em CI: 1 (para estabilidade); Localmente: automático
  workers: process.env.CI ? 1 : undefined,

  // Formato do relatório (HTML gera uma página bonita com resultados)
  reporter: 'html',

  // Configurações partilhadas por todos os testes
  use: {
    baseURL: 'http://localhost:5173',   // URL base (o frontend)
    trace: 'on-first-retry',             // Gravar trace (debug) na 1ª retentativa
    screenshot: 'only-on-failure',        // Tirar screenshot só quando falha
  },

  // Browsers a testar (por agora só Chromium)
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  /*
   * webServer: o Playwright pode iniciar servidores automaticamente antes dos testes!
   * Isto garante que backend e frontend estão a correr antes de testar.
   *
   * reuseExistingServer: em desenvolvimento, se já temos os servidores a correr,
   * não precisa de os reiniciar.
   */
  webServer: [
    {
      command: 'cd ../backend && npm run dev',   // Iniciar o backend
      port: 3001,                                 // Esperar que a porta 3001 esteja ativa
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd ../frontend && npm run dev',  // Iniciar o frontend
      port: 5173,                                 // Esperar que a porta 5173 esteja ativa
      reuseExistingServer: !process.env.CI,
    },
  ],
});

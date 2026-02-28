/*
 * ===== vite.config.js =====
 * Configuração do VITE - a ferramenta de build/bundler do frontend.
 *
 * O QUE É O VITE?
 * Vite é uma ferramenta que:
 * 1. Servidor de desenvolvimento: serve os ficheiros com Hot Module Replacement (HMR)
 *    (quando guardas um ficheiro, a página atualiza instantaneamente sem recarregar)
 * 2. Bundler: quando fazes "build", junta todos os ficheiros JS/CSS num pacote
 *    otimizado para produção
 *
 * PORQUE VITE E NÃO WEBPACK?
 * Vite é MUITO mais rápido que Webpack porque usa ES modules nativos do browser
 * durante o desenvolvimento, em vez de fazer bundle de tudo.
 */

// defineConfig: função do Vite que fornece auto-complete no editor
import { defineConfig } from 'vite';

// Plugin oficial do React para Vite (permite usar JSX, Fast Refresh, etc.)
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Plugins: extensões que adicionam funcionalidades ao Vite
  plugins: [react()], // Plugin React: suporta JSX, Fast Refresh (HMR para React)

  // Configuração do servidor de desenvolvimento
  server: {
    port: 5173, // Porta onde o frontend corre (http://localhost:5173)

    /*
     * PROXY: redireciona pedidos da API para o backend.
     * 
     * Quando o frontend faz fetch('/api/bets'), o browser envia o pedido
     * para localhost:5173 (o Vite). O proxy interceta e reencaminha
     * para localhost:3001 (o backend Express).
     *
     * SEM proxy: fetch('http://localhost:3001/api/bets') → problemas de CORS
     * COM proxy: fetch('/api/bets') → Vite redireciona → funciona!
     *
     * Isto só funciona em desenvolvimento. Em produção, usamos nginx ou similar.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // Destino: o nosso backend
        changeOrigin: true,               // Altera o header Origin para o do target
      },
    },
  },

  // Configuração de CSS/SCSS
  css: {
    preprocessorOptions: {
      scss: {
        /*
         * additionalData: código SCSS injetado no INÍCIO de CADA ficheiro .scss
         * Isto permite usar as variáveis ($primary, etc.) e mixins (@include card)
         * em qualquer ficheiro SCSS sem ter de fazer @use manualmente.
         *
         * "@" é um alias para a pasta /src (definido abaixo em resolve.alias)
         */
        additionalData: `@use "@/styles/variables" as *; @use "@/styles/mixins" as *;`,
      },
    },
  },

  // Resolução de caminhos (aliases)
  resolve: {
    alias: {
      /*
       * '@' é um atalho para a pasta '/src'
       * Em vez de: import algo from '../../../services/api'
       * Pode-se usar: import algo from '@/services/api'
       */
      '@': '/src',
    },
  },
});

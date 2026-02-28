/*
 * ===== main.jsx =====
 * Este é o PONTO DE ENTRADA da aplicação React.
 * É o primeiro ficheiro JavaScript que o browser executa.
 *
 * O que faz:
 * 1. Importa o React e o ReactDOM (a biblioteca que liga o React ao browser)
 * 2. Importa o componente principal "App" (a nossa aplicação inteira)
 * 3. Importa os estilos globais (CSS que se aplica a toda a página)
 * 4. "Monta" a aplicação dentro da <div id="root"> que está no index.html
 *
 * React.StrictMode é um wrapper que ajuda a encontrar problemas no código
 * durante o desenvolvimento (não afeta a produção).
 */

// Importar a biblioteca React (necessário para usar JSX - o HTML dentro do JS)
import React from 'react';

// ReactDOM é a "ponte" entre o React e o DOM do browser (a página web real)
import ReactDOM from 'react-dom/client';

// O componente App é a raiz da nossa aplicação - tudo começa aqui
import App from './App.jsx';

// Importar os estilos globais (reset CSS, cores base, tipografia, etc.)
import './styles/_global.scss';

// Criar a "raiz" do React no elemento HTML com id="root" (ver index.html)
// e renderizar (desenhar) a aplicação dentro dele
ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode ativa verificações extra durante o desenvolvimento
  <React.StrictMode>
    {/* O componente App contém toda a nossa aplicação */}
    <App />
  </React.StrictMode>
);

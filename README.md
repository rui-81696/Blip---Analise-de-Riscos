# Blip — Risk Analysis 🎰

> Aplicação Web interativa para análise de risco em apostas desportivas

**UTAD — Licenciatura em Engenharia Informática — Laboratório de Projeto**

- **Rui Daniel Ferreira Moreira** (81696) — Frontend/Design
- **Rafael Ribeiro Júlio** (81132) — Backend/Integração
- **Orientador:** Ricardo Soares
- **Coorientadores:** António Sousa | Luís Barbosa

---

## 📋 Sobre o Projeto

O Blip Risk Analysis é uma aplicação Web que permite a analistas e operadores de plataformas de apostas desportivas:

- **Visualizar** dados de apostas numa tabela interativa com ordenação e paginação
- **Filtrar** por desporto, evento, valor, nível de risco e datas
- **Monitorizar** métricas de risco em tempo real (lucro, perdas, exposição)
- **Consultar** dados em linguagem natural via WebLLM (em desenvolvimento)

## 🛠️ Stack Tecnológica

| Componente | Tecnologia |
|------------|-----------|
| Frontend | React + Vite + SCSS |
| Backend | Node.js + Express |
| Base de Dados | LowDB (JSON file-based) |
| IA/LLM | WebLLM (MLC) — client-side |
| Testes | Playwright (E2E) |
| Design | Figma |

## 📁 Estrutura do Projeto

```
Blip/
├── backend/                 # Servidor API REST
│   ├── src/
│   │   ├── data/           # Geração de dados mock + LowDB
│   │   │   ├── db.js       # Configuração LowDB
│   │   │   ├── mockGenerator.js  # Gerador de apostas simuladas
│   │   │   └── seed.js     # Script de seed inicial
│   │   ├── routes/         # Rotas da API
│   │   │   ├── bets.js     # Endpoints de apostas
│   │   │   └── metrics.js  # Endpoints de métricas
│   │   └── index.js        # Entry point do servidor
│   └── package.json
├── frontend/                # Aplicação React
│   ├── src/
│   │   ├── components/     # Componentes React
│   │   │   ├── BetsTable/  # Tabela de apostas
│   │   │   ├── Chat/       # Interface de chat (WebLLM)
│   │   │   ├── Filters/    # Painel de filtros
│   │   │   ├── MetricsPanel/ # Métricas agregadas
│   │   │   └── Pagination/ # Paginação
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # Serviço de API
│   │   ├── styles/         # SCSS globais e variáveis
│   │   ├── utils/          # Utilitários e formatadores
│   │   ├── App.jsx         # Componente principal
│   │   └── main.jsx        # Entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── tests/                   # Testes E2E
│   ├── e2e/
│   │   └── bets-table.spec.js
│   ├── playwright.config.js
│   └── package.json
├── docs/                    # Documentação
│   ├── api.md              # Documentação da API
│   └── README.md
├── .gitignore
├── package.json             # Root package com scripts combinados
└── README.md                # Este ficheiro
```

## 🚀 Quick Start

### Pré-requisitos

- **Node.js** (v18 ou superior)
- **npm** (v9 ou superior)

### Instalação

```bash
# Clonar o repositório
git clone <url-do-repositório>
cd Blip

# Instalar todas as dependências (root + backend + frontend + tests)
npm run install:all
```

### Executar em Desenvolvimento

```bash
# Iniciar backend E frontend num único comando
npm run dev
```

Ou em separado:

```bash
# Terminal 1 — Backend (http://localhost:3001)
npm run dev:backend

# Terminal 2 — Frontend (http://localhost:5173)
npm run dev:frontend
```

### Gerar Dados Mock

Os dados são gerados automaticamente ao iniciar o backend pela primeira vez. Para regenerar:

```bash
cd backend
npm run seed        # Gera 500 apostas
npm run seed 1000   # Gera 1000 apostas
```

### Executar Testes

```bash
# Testes E2E (requer backend e frontend a correr)
npm test

# Testes com interface visual
npm run test:ui
```

## 📡 API Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/bets` | Listar apostas (paginado/filtrado) |
| `GET` | `/api/bets/:id` | Detalhe de uma aposta |
| `GET` | `/api/bets/sports/list` | Lista de desportos |
| `GET` | `/api/bets/events/list` | Lista de eventos |
| `GET` | `/api/metrics` | Métricas agregadas |

Documentação completa em [`docs/api.md`](docs/api.md).

## 📊 Modelo de Dados — Aposta

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único |
| `userId` | string | ID anónimo do apostador |
| `sport` | enum | football, basketball, tennis, etc. |
| `event` | string | Nome do evento desportivo |
| `amount` | number (€) | Valor apostado |
| `odds` | number | Cotação |
| `status` | enum | pending, won, lost, void |
| `riskScore` | number (0-100) | Score de risco calculado |
| `createdAt` | ISO 8601 | Data de criação |

## 📅 Cronograma

| Semanas | Foco | Estado |
|---------|------|--------|
| 1-2 | Requisitos e planeamento | ✅ Concluído |
| 3-4 | Setup do projeto, tabela básica | 🔄 Em progresso |
| 5-6 | Backend com filtros, frontend com filtros | ⏳ |
| 7-8 | WebLLM, chat, métricas | ⏳ |
| 9-10 | Testes E2E, debugging, UI/UX | ⏳ |
| 11-12 | Otimizações, documentação, apresentação | ⏳ |

## 📝 Licença

Projeto académico — UTAD 2026

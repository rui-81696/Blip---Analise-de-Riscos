# Blip — Risk Analysis 🎰

> Aplicação Web interativa para análise de risco em apostas desportivas

**UTAD — Licenciatura em Engenharia Informática — Laboratório de Projeto**

- **Rafael Ribeiro Júlio** (81132) — Frontend/Design
- **Rui Daniel Ferreira Moreira** (81696) — Backend/Integração
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
| Base de Dados | POSTGREESQL |
| IA/LLM | WebLLM (MLC) — client-side |
| Testes | Playwright (E2E) |
| Design | Figma |


## 🚀 Quick Start

### Pré-requisitos

- **Node.js** (v18 ou superior)
- **npm** (v9 ou superior)
- **docker** 
´´´bash winget install -e --id Docker.DockerDesktop´´´

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

### PostgreSQL (opcional, recomendado)

O backend já suporta persistência em PostgreSQL. Para ativar:

```bash
cd backend
copy .env.example .env
npm run db:up
```

Depois, no ficheiro `.env`, define:

```env
POSTGRES_ENABLED=true
POSTGRES_RESET_ON_START=true
```

Configuração recomendada para throughput alto (ex.: 500 apostas/seg):

```env
POSTGRES_INSERT_CHUNK_SIZE=2000
POSTGRES_FLUSH_INTERVAL_MS=200
```

Com esta configuração:
- As 400k apostas iniciais são enfileiradas e gravadas em batch na BD
- As apostas live também entram na mesma fila
- O WebSocket não bloqueia à espera de writes SQL

E inicia o backend normalmente:

```bash
npm run dev
```

Para desligar a base de dados local:

```bash
cd backend
npm run db:down
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

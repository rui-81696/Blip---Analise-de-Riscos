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

## 🚀 Quick Start

### Pré-requisitos

- **Node.js** (v18 ou superior)
- **npm** (v9 ou superior)
- **docker** 
```bash
 winget install -e --id Docker.DockerDesktop
```

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
POSTGRES_RESET_ON_START=false
```

Configuração recomendada para throughput alto (ex.: 500 apostas/seg):

```env
POSTGRES_INSERT_CHUNK_SIZE=2000
POSTGRES_FLUSH_INTERVAL_MS=200
```

Com esta configuração:
- As 400k apostas iniciais só são geradas quando a tabela `bets` está vazia
- Em reinícios com dados existentes, a seed é ignorada e os dados persistidos são reutilizados
- As apostas live também entram na mesma fila
- O WebSocket não bloqueia à espera de writes SQL

### Fluxo de Seed Persistente + Live

1. Primeiro arranque com `bets` vazia:
- Gera ~400.000 apostas iniciais (timestamps em janela das últimas 24h)
- Enfileira para persistência PostgreSQL
- Inicia streaming live (~500/s)

2. Arranques seguintes sem reset:
- Não gera seed novamente
- Reutiliza histórico existente
- Continua com append live

3. Cutoff para cleanup de demo:
- No arranque, o backend grava `backend/db/demo-cutoff.json`
- Esse timestamp marca o início da fase live da demo

4. Cleanup no final da demo:

```bash
cd backend
npm run cleanup:demo:dry
npm run cleanup:demo:delete
```

Por default, o cleanup usa `timestamp > cutoff`, removendo apenas apostas live após o início da demo e preservando a seed inicial.

E inicia o backend normalmente:

```bash
npm run dev
```

Para desligar a base de dados local:

```bash
cd backend
npm run db:down
```

### Executar Testes

```bash
# Testes E2E (requer backend e frontend a correr)
npm test
```

## 📡 API Endpoints

### Bets (dados brutos)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/bets` | Listar apostas (paginado, últimas 200) |
| `GET` | `/api/bets/:id` | Obter aposta por ID |
| `GET` | `/api/bets/grouped` | Listar apostas agrupadas por evento/seleção |

### Stats (estatísticas analíticas)

| Método | Endpoint | Query Params | Descrição |
|--------|----------|--------------|-----------|
| `GET` | `/api/stats/summary` | `period` (1h, 24h, 7d, today) | Resumo geral: total apostas, stake, exposição |
| `GET` | `/api/stats/by-sport` | `period`, `limit`, `sort` | Estatísticas agrupadas por desporto |
| `GET` | `/api/stats/by-period` | `from`, `to`, `granularity` | Série temporal de estatísticas |
| `GET` | `/api/stats/by-risk` | `period` | Distribuição de risco por bucket (low/medium/high/critical) |

### Assistant (consultas em linguagem natural)

| Método | Endpoint | Body | Descrição |
|--------|----------|------|-----------|
| `POST` | `/api/assistant/query` | `{ intent, params }` | Processa query estruturada do assistant |

Exemplo de body:
```json
{
  "intent": "by-sport",
  "params": { "period": "24h", "limit": 100 }
}
```

Respostas incluem `{ data, explanation }` com dados estruturados + explicação textual.

### WebSocket (dados live)

| URL | Mensagem | Descrição |
|-----|----------|-----------|
| `ws://localhost:3001/ws` | `{ type: "initial", bets: [...] }` | Sincronização inicial com histórico |
| `ws://localhost:3001/ws` | `{ type: "live", bets: [...] }` | Novos dados de apostas em tempo real |

Documentação completa em [`docs/api.md`](docs/api.md).

---

## ⚙️ Configuração de Geração de Apostas

Para facilitar testes e estudos, a taxa de geração de apostas foi reduzida:

**Configuração atual (`backend/config.js`):**
- `INITIAL_COUNT = 1_000` (seed inicial reduzida)
- `BETS_PER_BATCH = 10` (10 apostas por batch)
- `INTERVAL_MS = 60_000` (1 minuto entre batches)
- **Taxa efetiva: ~10 apostas/minuto (~0.17 apostas/segundo)**

**Antes (configuração antiga):**
- `INITIAL_COUNT = 400_000`
- `BETS_PER_BATCH = 50`
- `INTERVAL_MS = 100`
- Taxa efetiva: ~500 apostas/segundo

Para alterar, edita `backend/config.js` e reinicia o backend.

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

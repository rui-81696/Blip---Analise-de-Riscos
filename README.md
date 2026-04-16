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

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/bets` | Listar apostas (paginado/filtrado) |

Documentação completa em [`docs/api.md`](docs/api.md).

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

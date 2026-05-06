# Plano prático para integrar WebLLM no projeto Blip Risk Analysis

Resumo rápido: este documento transforma a análise anterior em passos práticos, tarefas e mudanças de código prioritárias para integrar um assistente baseado em WebLLM sem comprometer a integridade dos dados.

## Objetivos

- Ter endpoints REST estáveis e auditáveis para métricas analíticas.
- Modularizar o backend (routes/controllers/services/db/middleware).
- Usar WebSocket exclusivamente para dados live; REST apenas para queries históricas e analíticas.
- Reduzir a geração de apostas para facilitar testes: 10 apostas a cada 1 minuto; reduzir também a seed inicial.
- Fornecer um roteiro de implementação e comandos de teste.

**Observação:** este ficheiro é auto-suficiente — inclui as rotas, riscos e recomendações do ficheiro anterior. Mantive todas as recomendações essenciais (endpoints propostos, separação de responsabilidades, remoção de polling, e redução das taxas de geração). Se notares algo que existia no MD anterior e não estiver claro, diz-me que eu o volto a acrescentar.

---

## 1. Refactor do backend (prioritário)

Porquê: `backend/index.js` já faz *demasiadas* coisas (HTTP, WS, DB init, seed, streaming, shutdown, rotas). Separar responsabilidades facilita adicionar endpoints para o assistant e testar.

Estrutura recomendada:

- `backend/index.js` — arranque mínimo: carregar config, conectar DB, montar routers, iniciar servidor.
- `backend/routes/*.js` — definição de rotas (ex.: `routes/bets.js`, `routes/stats.js`, `routes/assistant.js`).
- `backend/controllers/*.js` — tradução req→service + formatação de resposta.
- `backend/services/*.js` — lógica de negócio (agregações, cálculos, transformação de dados).
- `backend/db/postgres.js` — queries SQL (já existe; extrair helpers se necessário).
- `backend/middleware/*.js` — validação (Joi/celebrate), logging, error handler.

Passos práticos:

1. Criar `routes/stats.js` com rotas de métricas e `controllers/statsController.js` com métodos vazios que chamam `services/statsService.js`.
2. Mover lógica de `getGroupedBets` e `getLatestBets` para `services/statsService.js` (reutiliza `db/postgres.js`).
3. Atualizar `index.js` para usar `app.use('/api/stats', statsRouter)`.

Exemplo de router skeleton:

```js
// backend/routes/stats.js
import express from 'express'
import { getSummary, getBySport } from '../controllers/statsController.js'
const router = express.Router()
router.get('/summary', getSummary)
router.get('/by-sport', getBySport)
export default router
```

---

## 2. Endpoints REST concretos (specs)

Implemente estes endpoints com validação de inputs e limites rígidos.

1) `GET /api/stats/summary`
- Query params: `period=today|1h|24h|7d` (opcional)
- Response:

```json
{
	"totalBets": 1234,
	"totalStake": 54321.00,
	"totalExposure": 1234.00,
	"profitLoss": -123.00
}
```

2) `GET /api/stats/by-sport`
- Query params: `period`, `limit` (max 1000), `sort` (optional)
- Response: array por sport

3) `GET /api/stats/by-period`
- Query params: `from=ISO&to=ISO&granularity=minute|hour|day`
- Response: time series

4) `GET /api/stats/by-risk`
- Query params: `period`
- Response: distribution por bucket de risco

5) `POST /api/assistant/query`
- Body: `{ "intent": "by-sport", "params": { "period": "today" }, "question": "texto original" }` ou `{ "question": "texto" }` (o ideal é enviar `intent` já resolvida pelo WebLLM no cliente)
- Response: `{ data: ..., explanation: 'texto humano' }`

Nota: prefira que o cliente envie intents em JSON (menos ambiguidade). Se receber texto livre, trate-o apenas como fallback.

---

## 3. Remover polling — usar somente WebSocket para live

Racional: já tens WebSocket com streaming e um cliente em `GroupedBetsTable.jsx` que ingere mensagens WS. O polling em `frontend/src/hooks/useBets.js` cria duplicação, inconsistência e carga desnecessária.

Alterações concretas:

- Apagar/arquivar `frontend/src/hooks/useBets.js`.
- Garantir que todos os componentes que precisam de dados live leiam do WebSocket central (já implementado em `GroupedBetsTable.jsx`).
- Usar REST apenas para queries históricas/analíticas quando o usuário pede (ex.: `/api/stats/summary`).

Comando para editar/remover polling:

```bash
code frontend/src/hooks/useBets.js
# remover setInterval polling e retornar hooks que usam WS ou chamam REST sob demanda
```

Testes:

- Start backend e frontend, confirmar que ao abrir a UI o WS fornece updates e não há chamadas periódicas a `/api/bets`.

---

## 4. Reduzir geração de apostas (live + seed)

Para estudar o comportamento do sistema sem alta taxa, altere `backend/config.js`:

- `BETS_PER_BATCH = 10`
- `INTERVAL_MS = 60000` (1 minuto)
- `INITIAL_COUNT = 1000` (seed menor quando tabela vazia)

Passos:

1. Editar `backend/config.js` e alterar constants.

```bash
code backend/config.js
```

2. Reiniciar backend:

```bash
cd backend
npm run dev
```

Efeito: somente 10 apostas serão geradas a cada minuto, e a seed inicial (quando aplicável) ficará pequena — ideal para demos e investigação.

---

## 5. Segurança e validação

- Validar todos os inputs das rotas (`period`, `from`, `to`, `limit`) com um schema (Joi). Rejeitar requests fora do intervalo.
- Usar prepared statements (já presente no `db/postgres.js`).
- Limitar `POST /api/assistant/query` para evitar abuse de processamento.

---

## 6. Frontend: integração do WebLLM (recomendações práticas)

Fluxo recomendado:

1. O WebLLM roda no navegador (ou num serviço local controlado) e transforma texto em `intent` JSON.
2. O frontend envia a `intent` para `POST /api/assistant/query` ou chama diretamente os endpoints REST necessários.
3. O backend devolve dados reais; o frontend passa os dados para o WebLLM (opcional) para formatar uma explicação textual.

Componente sugerido: `src/components/AssistantChat.jsx` — controla input, chama WebLLM client-side, envia intents ao backend.

Exemplo mínimo do ciclo:

```text
Usuário -> AssistantChat (cliente WebLLM) -> intent JSON -> /api/assistant/query -> backend -> dados -> frontend -> apresentação + explicação
```

---

## Interface mínima recomendada

- O assistant deve ocupar o mínimo espaço possível na UI: implementar como um balão flutuante (floating) no canto inferior esquerdo da aplicação.
- Ao abrir, o balão mostra uma UI compacta: campo de input, histórico curto (últimas 3 mensagens), atalhos rápidos (ex.: `Resumo`, `Por desporto`), e um botão `Expandir` para ver mais detalhes.
- O balão deve ser minimizável e não cobrir a tabela; o foco principal da página deve continuar a ser a tabela de apostas.
- Incluir atalho de teclado (ex.: `Ctrl+M`) para abrir/fechar o assistant.
- Opcional: gravar um log mínimo de interações em `/api/assistant/logs` para auditoria e debugging.

Implementação prática (front):

- Criar `src/components/AssistantChat.jsx` com a UI compacta e integração com o WebLLM client-side.
- O `AssistantChat` envia intents JSON ao backend (`POST /api/assistant/query`) e recebe dados estruturados; o frontend apenas usa o WebLLM para interpretar linguagem natural e formatar explicações (sem substituir os números do DB).
- Garantir acessibilidade (atributos ARIA) e comportamento responsivo em telas pequenas.

---

## 7. Plano de migração e testes (passo-a-passo)

1. Criar branch `feature/webllm-infra`.
2. Implementar `routes/stats.js`, `controllers/statsController.js`, `services/statsService.js` (skeletons).
3. Atualizar `backend/config.js` com novos valores para BETS_PER_BATCH / INTERVAL_MS / INITIAL_COUNT.
4. Remover polling (`useBets.js`) e garantir WS único para live.
5. Implementar `POST /api/assistant/query` com validação mínima.
6. Testar localmente: `npm run dev` (root) e abrir UI; verificar 10 apostas/min e endpoints `/api/stats/*`.

Comandos úteis:

```bash
# na raíz do repositório
npm run dev

# apenas backend
cd backend && npm run dev

# levantar DB local (docker)
cd backend && npm run db:up
```

---

## 8. Exemplo de controller para o assistant

```js
// backend/controllers/assistantController.js
import { getBySport } from '../services/statsService.js'

export async function handleAssistantQuery(req, res) {
	const { intent, params, question } = req.body

	if (!intent) return res.status(400).json({ error: 'intent required' })

	try {
		if (intent === 'by-sport') {
			const data = await getBySport(params)
			return res.json({ data, explanation: `Risco por desporto para ${params.period || 'período solicitado'}` })
		}

		return res.status(400).json({ error: 'intent not supported' })
	} catch (err) {
		return res.status(500).json({ error: err.message })
	}
}
```

---

## 9. Checklist rápida (prioridade mínima)

- [ ] Extrair rotas de `index.js` para `routes/`.
- [ ] Criar `controllers/` e `services/` para estatísticas.
- [ ] Ajustar `backend/config.js` (BETS_PER_BATCH, INTERVAL_MS, INITIAL_COUNT).
- [ ] Remover polling em `useBets.js`.
- [ ] Adicionar `POST /api/assistant/query`.
- [ ] Documentar endpoints no README.

---

Se queres, agora eu posso: (escolhe uma opção)

1. Aplicar as mudanças no `backend/config.js` (reduzir geração e seed) e commitar.
2. Gerar skeletons de `routes/stats.js` e `controllers/statsController.js` e commitar.
3. Remover o polling em `frontend/src/hooks/useBets.js` e deixar apenas WS.

Indica qual opção queres executar e eu prossigo com as alterações no repositório.

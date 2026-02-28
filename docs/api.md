# API REST — Blip Risk Analysis

Base URL: `http://localhost:3001/api`

---

## Health Check

### `GET /api/health`

Verifica se o servidor está operacional.

**Resposta:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-28T12:00:00.000Z"
}
```

---

## Apostas (Bets)

### `GET /api/bets`

Lista apostas com paginação e filtros.

**Query Parameters:**

| Parâmetro   | Tipo     | Default      | Descrição                                      |
|-------------|----------|--------------|-------------------------------------------------|
| `page`      | number   | 1            | Página atual                                    |
| `limit`     | number   | 20           | Registos por página (max: 100)                  |
| `sortBy`    | string   | `createdAt`  | Campo de ordenação                              |
| `sortOrder` | string   | `desc`       | Direção (`asc` / `desc`)                        |
| `sport`     | string   | —            | Filtrar por desporto (separar por vírgula)       |
| `event`     | string   | —            | Filtrar por evento (pesquisa parcial)            |
| `status`    | string   | —            | Filtrar por estado (separar por vírgula)         |
| `minAmount` | number   | —            | Valor mínimo apostado                            |
| `maxAmount` | number   | —            | Valor máximo apostado                            |
| `minRisk`   | number   | —            | Risk score mínimo (0-100)                        |
| `maxRisk`   | number   | —            | Risk score máximo (0-100)                        |
| `dateFrom`  | ISO date | —            | Data de início do intervalo                      |
| `dateTo`    | ISO date | —            | Data de fim do intervalo                         |
| `search`    | string   | —            | Pesquisa em userId, event, sport, id             |

**Resposta:**
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "user_0001",
      "sport": "football",
      "event": "SL Benfica vs FC Porto",
      "amount": 150.00,
      "odds": 2.45,
      "status": "pending",
      "riskScore": 55,
      "createdAt": "2026-02-28T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 500,
    "totalPages": 25,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "filters": { ... }
}
```

### `GET /api/bets/:id`

Retorna detalhe de uma aposta específica.

### `GET /api/bets/sports/list`

Lista todos os desportos com apostas registadas.

### `GET /api/bets/events/list?sport=football`

Lista todos os eventos (filtro por desporto opcional).

---

## Métricas

### `GET /api/metrics`

Métricas agregadas de todas as apostas.

**Resposta:**
```json
{
  "totalBets": 500,
  "totalAmount": 2500000.00,
  "totalProfit": 350000.00,
  "totalLoss": 600000.00,
  "riskExposure": 1200000.00,
  "avgRiskScore": 42.5,
  "bySport": {
    "football": { "count": 150, "amount": 750000, "avgRisk": 45 }
  },
  "byStatus": {
    "pending": { "count": 120, "amount": 600000 }
  },
  "riskDistribution": {
    "low": 100,
    "medium": 200,
    "high": 150,
    "critical": 50
  }
}
```

---

## Códigos de Status

| Código | Significado                |
|--------|----------------------------|
| 200    | Sucesso                    |
| 404    | Recurso não encontrado     |
| 500    | Erro interno do servidor   |

import {
  flushAndClosePostgres,
  initPostgres,
  isPostgresEnabled,
  getBetsCount,
  truncateBets,
} from "./postgres.js";

function printHelp() {
  console.log(`
Uso:
  node db/cleanup-all.js --dry-run
  node db/cleanup-all.js --delete

Opcoes:
  --dry-run                  Mostra quantos registos existem (default)
  --delete                   Remove todos os registos da tabela bets
  --help                     Mostra esta ajuda
`);
}

function parseArgs(argv) {
  const options = {
    mode: "dry-run",
  };

  for (const arg of argv) {
    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--delete") {
      options.mode = "delete";
      continue;
    }

    if (arg === "--dry-run") {
      options.mode = "dry-run";
      continue;
    }

    throw new Error(`Argumento desconhecido: ${arg}`);
  }

  return options;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  await initPostgres();

  if (!isPostgresEnabled()) {
    console.warn("PostgreSQL desativado (POSTGRES_ENABLED=false). Cleanup cancelado.");
    process.exitCode = 1;
    return;
  }

  const total = await getBetsCount();

  if (options.mode === "dry-run") {
    console.log(`[dry-run] Registos atuais na tabela bets: ${total.toLocaleString()}`);
    return;
  }

  // delete mode
  console.log(`[delete] A remover todos os registos da tabela bets (total atual: ${total.toLocaleString()})`);
  const deleted = await truncateBets();
  console.log(`[delete] TRUNCATE executado. Registos removidos (antes): ${deleted.toLocaleString()}`);
}

run()
  .catch((error) => {
    console.error("Falha no cleanup-all:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await flushAndClosePostgres();
    } catch (error) {
      console.error("Erro ao fechar ligacao PostgreSQL:", error.message);
      process.exitCode = 1;
    }
  });

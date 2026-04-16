import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  countBetsAfterCutoff,
  deleteBetsAfterCutoff,
  flushAndClosePostgres,
  initPostgres,
  isPostgresEnabled,
} from "./postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printHelp() {
  console.log(`
Uso:
  node db/cleanup-demo.js --dry-run
  node db/cleanup-demo.js --delete

Opcoes:
  --dry-run                  Conta quantos registos seriam removidos (default)
  --delete                   Remove registos realmente
  --cutoff=<ISO>             Cutoff timestamp manual (sobrescreve ficheiro)
  --cutoff-file=<path>       Caminho para ficheiro com cutoff (default: db/demo-cutoff.json)
  --field=timestamp|created_at
                             Campo usado para cleanup (default: timestamp)
  --help                     Mostra esta ajuda
`);
}

function parseArgs(argv) {
  const options = {
    mode: "dry-run",
    cutoffIso: "",
    cutoffFile: path.join(__dirname, "demo-cutoff.json"),
    field: "timestamp",
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

    if (arg.startsWith("--cutoff=")) {
      options.cutoffIso = arg.slice("--cutoff=".length);
      continue;
    }

    if (arg.startsWith("--cutoff-file=")) {
      options.cutoffFile = path.resolve(arg.slice("--cutoff-file=".length));
      continue;
    }

    if (arg.startsWith("--field=")) {
      options.field = arg.slice("--field=".length);
      continue;
    }

    throw new Error(`Argumento desconhecido: ${arg}`);
  }

  if (!["timestamp", "created_at"].includes(options.field)) {
    throw new Error("--field deve ser timestamp ou created_at.");
  }

  return options;
}

async function resolveCutoffIso(options) {
  if (options.cutoffIso) {
    return options.cutoffIso;
  }

  const fileContent = await readFile(options.cutoffFile, "utf8");
  const parsed = JSON.parse(fileContent);

  if (!parsed.cutoffIso) {
    throw new Error(`Ficheiro de cutoff invalido: ${options.cutoffFile}`);
  }

  return parsed.cutoffIso;
}

function assertIsoDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Cutoff invalido: ${value}`);
  }

  return parsed.toISOString();
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const cutoffIso = assertIsoDate(await resolveCutoffIso(options));

  await initPostgres();

  if (!isPostgresEnabled()) {
    console.warn("PostgreSQL desativado (POSTGRES_ENABLED=false). Cleanup cancelado.");
    process.exitCode = 1;
    return;
  }

  const matchingCount = await countBetsAfterCutoff({
    cutoffIso,
    field: options.field,
  });

  if (options.mode === "dry-run") {
    console.log(
      `[dry-run] Registos elegiveis para cleanup: ${matchingCount.toLocaleString()} (campo=${options.field}, cutoff=${cutoffIso})`
    );
    return;
  }

  const deleted = await deleteBetsAfterCutoff({
    cutoffIso,
    field: options.field,
  });

  console.log(
    `[delete] Registos removidos: ${deleted.toLocaleString()} (campo=${options.field}, cutoff=${cutoffIso})`
  );
}

run()
  .catch((error) => {
    console.error("Falha no cleanup da demo:", error.message);
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

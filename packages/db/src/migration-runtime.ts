import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { ensurePostgresDatabase, getPostgresDataDirectory } from "./client.js";
import { createEmbeddedPostgresLogBuffer, formatEmbeddedPostgresError } from "./embedded-postgres-error.js";
import { resolveDatabaseTarget } from "./runtime-config.js";

type EmbeddedPostgresInstance = {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type EmbeddedPostgresCtor = new (opts: {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent: boolean;
  initdbFlags?: string[];
  onLog?: (message: unknown) => void;
  onError?: (message: unknown) => void;
}) => EmbeddedPostgresInstance;

type EmbeddedPostgresCredentials = {
  user: string;
  password: string;
};

export type MigrationConnection = {
  connectionString: string;
  source: string;
  stop: () => Promise<void>;
};

const LEGACY_EMBEDDED_POSTGRES_CREDENTIALS: EmbeddedPostgresCredentials = {
  user: "paperclip",
  password: "paperclip",
};

function readRunningPostmasterPid(postmasterPidFile: string): number | null {
  if (!existsSync(postmasterPidFile)) return null;
  try {
    const pid = Number(readFileSync(postmasterPidFile, "utf8").split("\n")[0]?.trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function readPidFilePort(postmasterPidFile: string): number | null {
  if (!existsSync(postmasterPidFile)) return null;
  try {
    const lines = readFileSync(postmasterPidFile, "utf8").split("\n");
    const port = Number(lines[3]?.trim());
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

async function isPortInUse(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve(error.code === "EADDRINUSE");
    });
    server.listen(port, "127.0.0.1", () => {
      server.close();
      resolve(false);
    });
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  const maxLookahead = 20;
  let port = startPort;
  for (let i = 0; i < maxLookahead; i += 1, port += 1) {
    if (!(await isPortInUse(port))) return port;
  }
  throw new Error(
    `Embedded PostgreSQL could not find a free port from ${startPort} to ${startPort + maxLookahead - 1}`,
  );
}

async function loadEmbeddedPostgresCtor(): Promise<EmbeddedPostgresCtor> {
  try {
    const mod = await import("embedded-postgres");
    return mod.default as EmbeddedPostgresCtor;
  } catch {
    throw new Error(
      "Embedded PostgreSQL support requires dependency `embedded-postgres`. Reinstall dependencies and try again.",
    );
  }
}

function buildEmbeddedPostgresConnectionString(
  port: number,
  databaseName: string,
  credentials: EmbeddedPostgresCredentials,
): string {
  return `postgres://${encodeURIComponent(credentials.user)}:${encodeURIComponent(credentials.password)}@127.0.0.1:${port}/${databaseName}`;
}

function buildEmbeddedPostgresAdminConnectionString(
  port: number,
  credentials: EmbeddedPostgresCredentials = LEGACY_EMBEDDED_POSTGRES_CREDENTIALS,
): string {
  return buildEmbeddedPostgresConnectionString(port, "postgres", credentials);
}

function readEmbeddedPostgresCredentials(dataDir: string): EmbeddedPostgresCredentials {
  const credentialsPath = path.resolve(dataDir, ".paperclip-embedded-postgres-credentials.json");
  if (!existsSync(credentialsPath)) return LEGACY_EMBEDDED_POSTGRES_CREDENTIALS;

  try {
    const parsed = JSON.parse(readFileSync(credentialsPath, "utf8")) as Partial<EmbeddedPostgresCredentials>;
    if (typeof parsed.user === "string" && parsed.user && typeof parsed.password === "string" && parsed.password) {
      return { user: parsed.user, password: parsed.password };
    }
  } catch {
    // Old local databases used the embedded-postgres default credentials.
  }

  return LEGACY_EMBEDDED_POSTGRES_CREDENTIALS;
}

async function ensureEmbeddedPostgresConnection(
  dataDir: string,
  preferredPort: number,
): Promise<MigrationConnection> {
  const EmbeddedPostgres = await loadEmbeddedPostgresCtor();
  const credentials = readEmbeddedPostgresCredentials(dataDir);
  const postmasterPidFile = path.resolve(dataDir, "postmaster.pid");
  const pgVersionFile = path.resolve(dataDir, "PG_VERSION");
  const runningPid = readRunningPostmasterPid(postmasterPidFile);
  const runningPort = readPidFilePort(postmasterPidFile);
  const logBuffer = createEmbeddedPostgresLogBuffer();

  async function inspectExistingPostgresAtPort(): Promise<{
    matchesDataDir: boolean;
    actualDataDir: string | null;
  }> {
    const actualDataDir = await getPostgresDataDirectory(
      buildEmbeddedPostgresAdminConnectionString(preferredPort, credentials),
    );
    return {
      matchesDataDir:
        typeof actualDataDir === "string" &&
        path.resolve(actualDataDir) === path.resolve(dataDir),
      actualDataDir,
    };
  }

  if (!runningPid && await isPortInUse(preferredPort)) {
    const { matchesDataDir, actualDataDir } = await inspectExistingPostgresAtPort();
    if (!matchesDataDir) {
      const detail = actualDataDir
        ? `with data_directory=${actualDataDir}`
        : "(unable to query data_directory - the port may be held by a non-PostgreSQL process)";
      throw new Error(
        `Port ${preferredPort} is already in use ${detail}, but migrations resolved dataDir=${path.resolve(dataDir)}. Refusing to start a side instance; align PAPERCLIP_HOME/PAPERCLIP_CONFIG or stop the running server first.`,
      );
    }

    await ensurePostgresDatabase(
      buildEmbeddedPostgresAdminConnectionString(preferredPort, credentials),
      "paperclip",
    );
    process.emitWarning(
      `Adopting an existing PostgreSQL instance on port ${preferredPort} for embedded data dir ${dataDir} because postmaster.pid is missing.`,
    );
    return {
      connectionString: buildEmbeddedPostgresConnectionString(preferredPort, "paperclip", credentials),
      source: `embedded-postgres@${preferredPort}`,
      stop: async () => {},
    };
  }

  if (!runningPid && existsSync(pgVersionFile)) {
    try {
      const { matchesDataDir } = await inspectExistingPostgresAtPort();
      if (!matchesDataDir) {
        throw new Error("reachable postgres does not use the expected embedded data directory");
      }
      await ensurePostgresDatabase(
        buildEmbeddedPostgresAdminConnectionString(preferredPort, credentials),
        "paperclip",
      );
      process.emitWarning(
        `Adopting an existing PostgreSQL instance on port ${preferredPort} for embedded data dir ${dataDir} because postmaster.pid is missing.`,
      );
      return {
        connectionString: buildEmbeddedPostgresConnectionString(preferredPort, "paperclip", credentials),
        source: `embedded-postgres@${preferredPort}`,
        stop: async () => {},
      };
    } catch {
      // Fall through and attempt to start the configured embedded cluster.
    }
  }

  if (runningPid) {
    const port = runningPort ?? preferredPort;
    const adminConnectionString = buildEmbeddedPostgresAdminConnectionString(port, credentials);
    await ensurePostgresDatabase(adminConnectionString, "paperclip");
    return {
      connectionString: buildEmbeddedPostgresConnectionString(port, "paperclip", credentials),
      source: `embedded-postgres@${port}`,
      stop: async () => {},
    };
  }

  const selectedPort = await findAvailablePort(preferredPort);
  const instance = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: credentials.user,
    password: credentials.password,
    port: selectedPort,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog: logBuffer.append,
    onError: logBuffer.append,
  });

  if (!existsSync(path.resolve(dataDir, "PG_VERSION"))) {
    try {
      await instance.initialise();
    } catch (error) {
      throw formatEmbeddedPostgresError(error, {
        fallbackMessage:
          `Failed to initialize embedded PostgreSQL cluster in ${dataDir} on port ${selectedPort}`,
        recentLogs: logBuffer.getRecentLogs(),
      });
    }
  }
  if (existsSync(postmasterPidFile)) {
    rmSync(postmasterPidFile, { force: true });
  }
  try {
    await instance.start();
  } catch (error) {
    throw formatEmbeddedPostgresError(error, {
      fallbackMessage: `Failed to start embedded PostgreSQL on port ${selectedPort}`,
      recentLogs: logBuffer.getRecentLogs(),
    });
  }

  const adminConnectionString = buildEmbeddedPostgresAdminConnectionString(selectedPort, credentials);
  await ensurePostgresDatabase(adminConnectionString, "paperclip");

  return {
    connectionString: buildEmbeddedPostgresConnectionString(selectedPort, "paperclip", credentials),
    source: `embedded-postgres@${selectedPort}`,
    stop: async () => {
      await instance.stop();
    },
  };
}

export async function resolveMigrationConnection(): Promise<MigrationConnection> {
  const target = resolveDatabaseTarget();
  if (target.mode === "postgres") {
    return {
      connectionString: target.connectionString,
      source: target.source,
      stop: async () => {},
    };
  }

  return ensureEmbeddedPostgresConnection(target.dataDir, target.port);
}

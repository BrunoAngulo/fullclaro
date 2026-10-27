import type sql from "mssql";
import { createRequire } from "node:module";

const globalForGtr = global as typeof globalThis & { gtrPool?: Promise<sql.ConnectionPool> };

const connectionString = process.env.GTR_SQL_CONNECTION_STRING ??
  "Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=GTR_FullClaro;Trusted_Connection=Yes;Encrypt=Yes;TrustServerCertificate=Yes;";
const requireFromProject = createRequire(`${process.cwd()}\\package.json`);

function sqlDriver() {
  return requireFromProject("mssql/msnodesqlv8") as typeof import("mssql");
}

async function openPool() {
  // Se carga únicamente al atender una consulta. Así Next no intenta abrir SQL
  // Server durante su compilación.
  const driver = sqlDriver();
  return new driver.ConnectionPool({
    driver: "msnodesqlv8",
    connectionString,
    // Si SQL Server queda temporalmente ocupado, no dejamos al panel esperando
    // indefinidamente con una conexión reutilizada en mal estado.
    connectionTimeout: 12_000,
    requestTimeout: 30_000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
  } as unknown as import("mssql").config).connect();
}

function getPool() {
  if (!globalForGtr.gtrPool) {
    globalForGtr.gtrPool = openPool().catch((error) => {
      globalForGtr.gtrPool = undefined;
      throw error;
    });
  }
  return globalForGtr.gtrPool;
}

export async function executeGtr(procedure: string, fecha: string, inputs: Record<string, string | number> = {}) {
  const driver = sqlDriver();
  let pool: sql.ConnectionPool;
  try {
    pool = await getPool();
  } catch {
    /* Una conexión fallida no se conserva para la siguiente consulta. */
    globalForGtr.gtrPool = undefined;
    pool = await getPool();
  }
  const request = pool.request().input("Fecha", driver.Date, fecha);
  for (const [name, value] of Object.entries(inputs))
    request.input(name, typeof value === "number" ? driver.Int : driver.VarChar(8), value);
  const result = await request.execute(procedure);
  return result.recordset;
}

/** Ejecuta procedimientos que deliberadamente devuelven varias salidas, como
 * la planificación semanal: resumen, horarios y cobertura por tramo. */
export async function executeGtrRecordsets(procedure: string, inputs: Record<string, string | number | boolean>) {
  const driver = sqlDriver();
  let pool: sql.ConnectionPool;
  try {
    pool = await getPool();
  } catch {
    globalForGtr.gtrPool = undefined;
    pool = await getPool();
  }
  const request = pool.request();
  for (const [name, value] of Object.entries(inputs)) {
    if (typeof value === "boolean") request.input(name, driver.Bit, value);
    else if (typeof value === "number") request.input(name, driver.Int, value);
    else if (/^Fecha/.test(name) && /^\d{4}-\d{2}-\d{2}$/.test(value)) request.input(name, driver.Date, value);
    else request.input(name, driver.NVarChar(name.endsWith("Json") ? driver.MAX : 250), value);
  }
  const result = await request.execute(procedure);
  return result.recordsets as sql.IRecordSet<Record<string, unknown>>[];
}

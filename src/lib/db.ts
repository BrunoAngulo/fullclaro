import mysql from "mysql2/promise";

const globalForDb = global as unknown as { mysqlPool?: mysql.Pool };

export const db =
  globalForDb.mysqlPool ??
  mysql.createPool({
    host: process.env.MYSQL_HOST ?? "localhost",
    port: Number(process.env.MYSQL_PORT ?? 3307),
    database: process.env.MYSQL_DATABASE ?? "full_claro",
    user: process.env.MYSQL_USER ?? "fullclaro_app",
    password: process.env.MYSQL_PASSWORD ?? "cambia_esta_clave",
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.mysqlPool = db;
}

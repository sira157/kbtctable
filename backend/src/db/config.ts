/**
 * DB connection settings.
 *  - Local (XAMPP / Docker): DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *  - Cloud (Aiven etc.): DATABASE_URL=mysql://user:pass@host:port/dbname  (+ DB_SSL_CA = CA certificate PEM)
 * SSL is on when DATABASE_URL contains ssl-mode=REQUIRED, DB_SSL=1, or DB_SSL_CA is set.
 */
export interface DbConfig {
  host: string; port: number; user: string; password: string; database: string;
  ssl?: { ca?: string; rejectUnauthorized: boolean };
}

export function dbConfig(): DbConfig {
  const url = process.env.DATABASE_URL;
  const ca = process.env.DB_SSL_CA?.replace(/\\n/g, "\n");
  let cfg: DbConfig;
  let wantSsl = process.env.DB_SSL === "1" || process.env.DB_SSL === "true" || !!ca;
  if (url) {
    const u = new URL(url);
    cfg = {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, "")) || "myapp",
    };
    if (/ssl-mode=(required|verify)/i.test(u.search) || u.searchParams.get("ssl") === "true") wantSsl = true;
  } else {
    cfg = {
      host: process.env.DB_HOST ?? "127.0.0.1",
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER ?? "root",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "myapp",
    };
  }
  // with the provider's CA the certificate is verified; without it the connection is still encrypted
  if (wantSsl) cfg.ssl = ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
  return cfg;
}

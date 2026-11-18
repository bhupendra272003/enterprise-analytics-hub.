import 'dotenv/config';
const required = ['SESSION_SECRET','DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
export const config = {
  port: Number(process.env.PORT || 4000),
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:3000',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'strict',
  sessionSecret: process.env.SESSION_SECRET,
  dataStorageDir: process.env.DATA_STORAGE_DIR || './storage/datasets',
  inviteBaseUrl: process.env.INVITE_BASE_URL || 'http://localhost:3000/accept-invite',
  db: { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD }
};
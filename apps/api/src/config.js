import 'dotenv/config';
const required = ['SESSION_SECRET','DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  smtpFrom: process.env.SMTP_FROM || 'NEXUS Analytics <no-reply@example.com>',
  port: Number(process.env.PORT || 4000),
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:3000',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'strict',
  sessionSecret: process.env.SESSION_SECRET,
  dataStorageDir: process.env.DATA_STORAGE_DIR || './storage/datasets',
  pythonExecutable: process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3'),
  inviteBaseUrl: process.env.INVITE_BASE_URL || 'http://localhost:3000/accept-invite',
  db: { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD }
};
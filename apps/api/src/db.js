import mysql from 'mysql2/promise';
import { config } from './config.js';

const ssl = process.env.DB_SSL_CA
  ? { ca: process.env.DB_SSL_CA, rejectUnauthorized: true }
  : undefined;

export const pool = mysql.createPool({
  ...config.db,
  ...(ssl ? { ssl } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

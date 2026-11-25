import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL 未设置'); process.exit(1); }

console.log('连接:', url.replace(/\/\/[^@]+@/, '//****@'));

const sql = postgres(url, { ssl: 'require' });

try {
  const rows = await sql`SELECT NOW() as now`;
  console.log('连接成功!', rows[0]);
} catch (err) {
  console.error('连接失败:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}

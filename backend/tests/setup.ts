import "../src/env";

// 测试库优先：配置 TEST_DATABASE_URL 时使用独立库；否则退回本地开发库。
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.NODE_ENV = "test";
process.env.EXPERIMENTAL_ROUTES = "false";

# Backend tests

## 运行

```bash
cd backend
npm test            # vitest run
npm run test:watch  # 监听模式
```

## 测试库

- 默认使用 `.env.local` 里的 `DATABASE_URL`（本地 Supabase）。
- 想隔离测试数据时，在 `backend/.env.test.local` 或系统环境里设置：

```bash
TEST_DATABASE_URL=postgresql://postgres:password@127.0.0.1:54322/godeeper_test
```

`tests/setup.ts` 会在导入应用前把 `DATABASE_URL` 替换成它。测试库需要先执行迁移/建表。

## 约定

- 改了任何路由（新增、删除、路径/方法变化）→ `tests/contract/routes.test.ts` 的快照会失败，先确认变更再更新快照：
  `npx vitest run -u tests/contract/routes.test.ts`
- 改了越权、额度、分享、软删除行为 → 必须同步修改对应 `tests/integration/*.test.ts`。
- 测试数据必须自行清理（`tests/helpers/db.ts` 提供创建/删除用户的工具）。
- 认证在集成测试里通过 `vi.mock` 注入固定用户，不依赖真实 Supabase 登录。

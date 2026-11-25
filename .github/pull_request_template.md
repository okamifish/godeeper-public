# 后端变更检查

<!-- 仅在后端或接口相关改动时勾选；不涉及可整段删除 -->

## 变更内容

- 改了什么：
- 影响哪些接口 / 前端页面：

## 后端检查（涉及 backend/ 时必填）

- [ ] 新增或修改的接口已更新 `backend/tests/contract/__snapshots__/routes.test.ts.snap`
- [ ] 涉及越权 / 额度 / 分享 / 软删除的行为已补或改对应 `backend/tests/**`
- [ ] `cd backend && npx tsc --noEmit` 通过
- [ ] `cd backend && npm test` 通过
- [ ] 涉及数据库变更时，迁移文件已提交并在本地验证

## 前端检查（涉及 frontend/ 时必填）

- [ ] `cd frontend && npx tsc --noEmit` 通过
- [ ] `cd frontend && npx next build` 通过
- [ ] 关键交互已在浏览器点选验证（说明验证了哪些）

## 报告

- [ ] 已在 `FINAL_REPORT.md` 写明「改了哪些文件 / 跑了哪些检查 / 哪些没跑」
- [ ] 需要用户查看的报告已输出 HTML 到项目目录

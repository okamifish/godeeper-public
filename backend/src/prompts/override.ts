import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { promptTemplates } from "../db/schema";

/**
 * 只读取后台启用中的提示词覆盖。
 * 私有 Pro 包用它保留管理员调参能力，同时不在公开仓库保存默认提示词文本。
 */
export async function getPromptOverride(feature: string): Promise<string | null> {
  const [row] = await db
    .select({ content: promptTemplates.content })
    .from(promptTemplates)
    .where(and(
      eq(promptTemplates.feature, feature),
      eq(promptTemplates.enabled, true),
    ))
    .orderBy(desc(promptTemplates.version))
    .limit(1);
  return row?.content ?? null;
}

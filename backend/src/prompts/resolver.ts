import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { promptTemplates } from "../db/schema";
import {
  PROMPT_CATALOG_BY_ID,
  buildTaskSystemPromptContent,
  getPromptDefault,
  normalizeTaskType,
  renderTemplateContent,
} from "./catalog";

export type PromptSource = "database" | "default";

export interface EffectivePrompt {
  id: string;
  content: string;
  source: PromptSource;
  version: number;
  updatedAt: string | null;
  rowId: string | null;
}

/**
 * 取一条提示词的生效版本：后台启用中的最新覆盖优先，否则回退代码默认。
 * 同一 feature 若存在多行，取 updatedAt 最新的一行。
 */
export async function getEffectivePrompt(id: string): Promise<EffectivePrompt> {
  const definition = PROMPT_CATALOG_BY_ID[id];
  if (!definition) {
    throw new Error(`UNKNOWN_PROMPT_TEMPLATE: ${id}`);
  }

  try {
    const [row] = await db
      .select({
        id: promptTemplates.id,
        content: promptTemplates.content,
        version: promptTemplates.version,
        updatedAt: promptTemplates.updatedAt,
      })
      .from(promptTemplates)
      .where(and(eq(promptTemplates.feature, id), eq(promptTemplates.enabled, true)))
      .orderBy(desc(promptTemplates.updatedAt))
      .limit(1);

    if (row) {
      return {
        id,
        content: row.content,
        source: "database",
        version: row.version,
        updatedAt: row.updatedAt?.toISOString() ?? null,
        rowId: row.id,
      };
    }
  } catch {
    // 数据库不可用时保持产品可用：回退代码默认。
  }

  return {
    id,
    content: definition.content,
    source: "default",
    version: 0,
    updatedAt: null,
    rowId: null,
  };
}

/** 渲染生效版本（后台覆盖或代码默认）的用户消息模板。 */
export async function resolvePrompt(
  id: string,
  variables: Record<string, string | number> = {},
): Promise<string> {
  const effective = await getEffectivePrompt(id);
  return renderTemplateContent(effective.content, id, variables);
}

export interface EffectiveTaskParts {
  type: string;
  base: EffectivePrompt;
  contract: EffectivePrompt;
  instruction: EffectivePrompt;
  systemPrompt: string;
}

/** 任务系统提示词的三段拼装：基础 + 输出契约 + 类型指令。 */
export async function getEffectiveTaskParts(
  taskType?: string,
): Promise<EffectiveTaskParts> {
  const type = normalizeTaskType(taskType);
  const [base, contract, instruction] = await Promise.all([
    getEffectivePrompt("task"),
    getEffectivePrompt("task:output-contract"),
    getEffectivePrompt(`task:${type}`),
  ]);

  return {
    type,
    base,
    contract,
    instruction,
    systemPrompt: buildTaskSystemPromptContent(
      base.content,
      contract.content,
      instruction.content,
    ),
  };
}

/** 供启动/测试使用的默认正文兜底。 */
export function getPromptDefaultContent(id: string): string {
  return getPromptDefault(id) ?? "";
}

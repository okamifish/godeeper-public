/**
 * 反链片段截断：核心与私有 Pro 服务共用，避免两套实现漂移。
 *
 * 截断正文时不要把提及 token 切成半截，避免前端显示生 ID。
 */
export function backlinkSnippet(body: string, max = 1200): string {
  const text = body.slice(0, max);
  const open = text.lastIndexOf("](");
  if (open === -1 || text.includes(")", open)) return text;

  // 只处理被截断的 gd:// 提及 token；其他链接不在此处特殊处理。
  const rest = text.slice(open + 2);
  if (!"gd://".startsWith(rest) && !rest.startsWith("gd://")) return text;

  const labelStart = text.lastIndexOf("[", open);
  return labelStart >= 0 ? text.slice(0, labelStart) : text.slice(0, open);
}

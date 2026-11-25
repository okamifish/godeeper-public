/**
 * Jina Reader 覆盖范围测试脚本
 *
 * 测试 8 类典型 URL 的抓取效果：
 *  1. 普通博客/文章
 *  2. SPA 单页应用（Notion、飞书）
 *  3. PDF 文档
 *  4. 视频站点（YouTube、B站）
 *  5. 中文网站（知乎、微信公众号）
 *  6. 付费墙/反爬（WSJ）
 *  7. 技术文档（MDN）
 *  8. 社交媒体（Twitter/X）
 *
 * 用法：node scripts/test-jina-reader.mjs
 *
 * 需要 HTTPS_PROXY 环境变量（系统代理）和 JINA_API_KEY。
 * 示例：
 *   HTTPS_PROXY=http://127.0.0.1:7892 JINA_API_KEY=jina_xxx node scripts/test-jina-reader.mjs
 */

const JINA_READER_URL = "https://r.jina.ai/";
const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || "";
const JINA_API_KEY = process.env.JINA_API_KEY || "";

// Simple global proxy via undici (Node.js 18+ built-in)
if (PROXY_URL) {
  const { ProxyAgent, setGlobalDispatcher } = await import("undici");
  setGlobalDispatcher(new ProxyAgent(PROXY_URL));
}

const TEST_URLS = [
  // 1. 普通博客/文章
  { category: "博客文章", url: "https://blog.samaltman.com/the-gentle-singularity" },
  { category: "博客文章", url: "https://www.paulgraham.com/greatwork.html" },

  // 2. SPA 单页应用
  { category: "SPA", url: "https://www.notion.so/blog/notion-updates" },

  // 3. PDF 文档
  { category: "PDF", url: "https://arxiv.org/abs/2303.08774" },

  // 4. 视频站点
  { category: "视频", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  { category: "视频", url: "https://www.bilibili.com/video/BV1GJ411x7h7" },

  // 5. 中文网站
  { category: "中文", url: "https://zhuanlan.zhihu.com/p/703252394" },
  { category: "中文", url: "https://mp.weixin.qq.com/s/fake-test-article" },

  // 6. 付费墙/反爬
  { category: "付费墙", url: "https://www.wsj.com/tech/ai/openai-chatgpt-ai-agent-2025-plan-6c0df5da" },

  // 7. 技术文档
  { category: "技术文档", url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API" },
  { category: "技术文档", url: "https://nextjs.org/docs/getting-started/installation" },

  // 8. 社交媒体
  { category: "社交媒体", url: "https://x.com/OpenAI/status/1800000000000000000" },
];

async function testJinaReader(url) {
  const startTime = Date.now();
  try {
    const headers = { Accept: "text/plain" };
    if (JINA_API_KEY) {
      headers["Authorization"] = `Bearer ${JINA_API_KEY}`;
    }
    const res = await fetch(`${JINA_READER_URL}${encodeURIComponent(url)}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!res.ok) {
      return { success: false, status: res.status, elapsed, contentLength: 0, preview: `HTTP ${res.status}` };
    }

    const text = await res.text();
    const contentLength = text.length;

    // Quality heuristics
    const hasRealContent = contentLength > 200 && !text.includes("Access denied") && !text.includes("blocked");
    const preview = text.slice(0, 200).replace(/\n/g, " ").trim();

    return { success: hasRealContent, status: res.status, elapsed, contentLength, preview };
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return { success: false, status: "ERR", elapsed, contentLength: 0, preview: err.message };
  }
}

async function main() {
  console.log("=== Jina Reader 覆盖范围测试 ===\n");
  console.log(`Proxy: ${PROXY_URL || "(无)"}`);
  console.log(`API Key: ${JINA_API_KEY ? "已配置" : "(未配置，匿名模式可能被封)"}\n`);
  console.log(`测试 URL 数量: ${TEST_URLS.length}\n`);

  const results = [];

  for (const { category, url } of TEST_URLS) {
    process.stdout.write(`  [${category}] ${url.slice(0, 60)}... `);
    const result = await testJinaReader(url);
    const icon = result.success ? "OK" : "FAIL";
    console.log(`${icon} (${result.elapsed}s, ${result.contentLength} chars)`);
    results.push({ category, url, ...result });
  }

  // Summary by category
  console.log("\n=== 分类统计 ===\n");

  const categories = [...new Set(results.map((r) => r.category))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const ok = catResults.filter((r) => r.success).length;
    const total = catResults.length;
    const avgChars = Math.round(catResults.reduce((s, r) => s + r.contentLength, 0) / total);
    console.log(`  ${cat}: ${ok}/${total} 成功, 平均 ${avgChars} 字符`);
  }

  // Failed details
  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.log("\n=== 失败详情 ===\n");
    for (const f of failed) {
      console.log(`  [${f.category}] ${f.url}`);
      console.log(`    Status: ${f.status}, Preview: ${f.preview.slice(0, 100)}\n`);
    }
  }

  // Overall
  const totalOk = results.filter((r) => r.success).length;
  console.log(`\n总计: ${totalOk}/${results.length} 成功\n`);
}

main();

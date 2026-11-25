// Mock data for admin pages — used as API fallback when backend is unavailable

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}
function iso(ago: number, h = 0, m = 0): string {
  const d = new Date(); d.setDate(d.getDate() - ago); d.setHours(h, m, 0, 0); return d.toISOString();
}
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60000).toISOString();
}

export const MOCK_STATS = {
  users: 1247, canvases: 3892, nodes: 28451, todayAiCalls: 387, todayNewUsers: 23,
};

export const MOCK_ENHANCED = {
  dau: 186, depthScore: 3.7, todayCostUsd: "12.48", heavyUsers: 34, failedTasks: 7, riskAlerts: 2,
};

export const MOCK_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: daysAgo(29 - i),
  new_users: Math.floor(Math.random() * 30 + 10),
  new_canvases: Math.floor(Math.random() * 50 + 20),
  ai_calls: Math.floor(Math.random() * 300 + 100),
}));

export const MOCK_USERS = [
  { id: "u1", email: "alice@example.com", displayName: "Alice Chen", membership: "pro", createdAt: iso(44, 8), canvasCount: 24, nodeCount: 312, todayAiCalls: 15, lastActiveAt: minutesAgo(120) },
  { id: "u2", email: "bob@example.com", displayName: "Bob Wang", membership: "free", createdAt: iso(25, 10), canvasCount: 3, nodeCount: 41, todayAiCalls: 2, lastActiveAt: minutesAgo(26 * 60) },
  { id: "u3", email: "carol@example.com", displayName: "Carol Li", membership: "team", createdAt: iso(67, 14), canvasCount: 58, nodeCount: 904, todayAiCalls: 21, lastActiveAt: minutesAgo(12) },
  { id: "u4", email: "dave@example.com", displayName: "Dave Zhang", membership: "free", createdAt: iso(6, 9), canvasCount: 1, nodeCount: 12, todayAiCalls: 0, lastActiveAt: minutesAgo(3 * 24 * 60) },
  { id: "u5", email: "eve@example.com", displayName: "Eve Liu", membership: "pro", createdAt: iso(28, 16), canvasCount: 24, nodeCount: 280, todayAiCalls: 9, lastActiveAt: minutesAgo(5 * 60) },
  { id: "u6", email: "frank@example.com", displayName: "Frank Zhao", membership: "free", createdAt: iso(11, 11), canvasCount: 5, nodeCount: 63, todayAiCalls: 3, lastActiveAt: minutesAgo(8 * 24 * 60) },
];

export const MOCK_USER_DETAIL = {
  id: "u1", email: "alice@example.com", displayName: "Alice Chen", membership: "pro",
  apiProvider: "siliconflow", createdAt: iso(44, 8), lastActiveAt: minutesAgo(120),
  stats: { canvases: 24, canvasesRecent30: 3, nodes: 312, aiTotal: 1247, aiToday: 15, totalCostUsd: "47.82", monthCostUsd: "12.40" },
};

export const MOCK_USER_ACTIVITY = [
  { type: "task_run", detail: "Analyze market trends", status: "success", model: "deepseek-v4", durationMs: 134000, createdAt: iso(0, 10, 12) },
  { type: "canvas_created", detail: "Q3 Strategy Planning", createdAt: iso(0, 9, 30) },
  { type: "ai_call", detail: "Deep dive on competitors", model: "deepseek-v4", costUsd: "0.0042", createdAt: iso(1, 16, 45) },
  { type: "task_run", detail: "Import and analyze source", status: "success", model: "gpt-4o", durationMs: 48000, createdAt: iso(1, 14, 20) },
  { type: "canvas_created", detail: "Product Roadmap 2026", createdAt: iso(2, 11, 0) },
];

export const MOCK_CANVASES = [
  { id: "c1", title: "Q3 Strategy Planning", ownerEmail: "alice@example.com", nodeCount: 45, isPublic: true, shareCount: 3, createdAt: iso(6, 8), updatedAt: iso(0, 10) },
  { id: "c2", title: "Product Roadmap 2026", ownerEmail: "carol@example.com", nodeCount: 112, isPublic: false, shareCount: 0, createdAt: iso(8, 14), updatedAt: iso(0, 9) },
  { id: "c3", title: "Market Analysis", ownerEmail: "alice@example.com", nodeCount: 67, isPublic: true, shareCount: 7, createdAt: iso(11, 10), updatedAt: iso(1, 16) },
  { id: "c4", title: "Tech Stack Evaluation", ownerEmail: "eve@example.com", nodeCount: 28, isPublic: false, shareCount: 1, createdAt: iso(4, 9), updatedAt: iso(2, 14) },
  { id: "c5", title: "User Research Notes", ownerEmail: "bob@example.com", nodeCount: 15, isPublic: false, shareCount: 0, createdAt: iso(1, 11), updatedAt: iso(1, 11) },
];

export const MOCK_AI_OVERVIEW = { totalCalls: 12847, todayCalls: 387, activeUsersToday: 42, avgPerUser: 8.3 };
export const MOCK_AI_TREND = Array.from({ length: 30 }, (_, i) => ({ date: daysAgo(29 - i), calls: Math.floor(Math.random() * 400 + 200) }));
export const MOCK_AI_RANKING = [
  { email: "carol@example.com", membership: "team", todayCalls: 34, totalCalls: 3420 },
  { email: "alice@example.com", membership: "pro", todayCalls: 15, totalCalls: 2870 },
  { email: "eve@example.com", membership: "pro", todayCalls: 8, totalCalls: 1560 },
  { email: "frank@example.com", membership: "free", todayCalls: 5, totalCalls: 890 },
  { email: "bob@example.com", membership: "free", todayCalls: 2, totalCalls: 340 },
];
export const MOCK_QUOTA_HIT = { freeUsers: 892, hitLimit: 23, hitRate: "2.6%" };
export const MOCK_FEATURE_COST = [
  { feature: "task", calls: 8450, inputTokens: 25350000, outputTokens: 8450000, costUsd: "245.80" },
  { feature: "source", calls: 2340, inputTokens: 7020000, outputTokens: 2340000, costUsd: "67.30" },
  { feature: "expand", calls: 1280, inputTokens: 3840000, outputTokens: 1280000, costUsd: "42.10" },
  { feature: "inspire", calls: 777, inputTokens: 2331000, outputTokens: 777000, costUsd: "29.01" },
];
export const MOCK_MODEL_COST = [
  { model: "deepseek-v4", calls: 5600, inputTokens: 16800000, outputTokens: 5600000, costUsd: "112.00" },
  { model: "gpt-4o", calls: 3200, inputTokens: 9600000, outputTokens: 3200000, costUsd: "160.00" },
  { model: "claude-sonnet-4", calls: 2100, inputTokens: 6300000, outputTokens: 2100000, costUsd: "84.00" },
  { model: "qwen-plus", calls: 1247, inputTokens: 3741000, outputTokens: 1247000, costUsd: "18.71" },
  { model: "gemini-2.5-pro", calls: 700, inputTokens: 2100000, outputTokens: 700000, costUsd: "9.50" },
];

export const MOCK_PLANS = [
  { id: "p1", name: "free", priceCents: 0, canvasesLimit: 3, nodesPerCanvas: 50, aiTasksPerDay: 10, stripePriceId: null as string | null },
  { id: "p2", name: "pro", priceCents: 999, canvasesLimit: -1, nodesPerCanvas: -1, aiTasksPerDay: 200, stripePriceId: "price_pro_123" },
  { id: "p3", name: "team", priceCents: 2999, canvasesLimit: -1, nodesPerCanvas: -1, aiTasksPerDay: 0, stripePriceId: "price_team_456" },
];

export const MOCK_MODELS = [
  { id: "m1", name: "DeepSeek V4", provider: "openrouter", modelName: "deepseek-ai/DeepSeek-V4-Flash", inputPricePer1k: "0.002", outputPricePer1k: "0.008", enabled: true, allowedPlans: "free,pro,team" },
  { id: "m2", name: "GPT-4o", provider: "openai", modelName: "gpt-4o", inputPricePer1k: "0.005", outputPricePer1k: "0.015", enabled: true, allowedPlans: "pro,team" },
  { id: "m3", name: "Claude Sonnet 4", provider: "anthropic", modelName: "claude-sonnet-4-20250514", inputPricePer1k: "0.003", outputPricePer1k: "0.015", enabled: true, allowedPlans: "pro,team" },
  { id: "m4", name: "Qwen Plus", provider: "openrouter", modelName: "qwen-plus-latest", inputPricePer1k: "0.0015", outputPricePer1k: "0.006", enabled: true, allowedPlans: "free,pro,team" },
  { id: "m5", name: "Gemini 2.5 Pro", provider: "openrouter", modelName: "google/gemini-2.5-pro", inputPricePer1k: "0.00125", outputPricePer1k: "0.005", enabled: false, allowedPlans: "pro,team" },
];

export const MOCK_PROMPTS = [
  { id: "pt1", name: "Task Reasoning", content: "You are an AI reasoning assistant. Break down the following task into structured insights...", feature: "task", version: 3, enabled: true, updatedAt: iso(6, 10) },
  { id: "pt2", name: "Source Analysis", content: "Analyze the following source content and extract key points, entities, and relationships...", feature: "source", version: 2, enabled: true, updatedAt: iso(8, 14) },
  { id: "pt3", name: "Point Expansion", content: "Given this node context, generate deeper sub-questions and related perspectives...", feature: "expand", version: 2, enabled: true, updatedAt: iso(11, 9) },
  { id: "pt4", name: "Inspiration Generator", content: "Based on the current canvas context, generate an inspiring question direction...", feature: "inspire", version: 1, enabled: true, updatedAt: iso(55) },
];

export const MOCK_TASK_RUNS = [
  { id: "tr1", taskId: "t-a1b2c3", email: "alice@example.com", model: "deepseek-v4", inputTokens: 2400, outputTokens: 1800, durationMs: 2340, status: "success", errorMsg: null as string | null, createdAt: iso(0, 10, 12) },
  { id: "tr2", taskId: "t-d4e5f6", email: "carol@example.com", model: "gpt-4o", inputTokens: 3200, outputTokens: 2800, durationMs: 3120, status: "success", errorMsg: null as string | null, createdAt: iso(0, 9, 58) },
  { id: "tr3", taskId: "t-g7h8i9", email: "alice@example.com", model: "deepseek-v4", inputTokens: 1200, outputTokens: 0, durationMs: 890, status: "failed", errorMsg: "Rate limit exceeded", createdAt: iso(0, 9, 45) },
  { id: "tr4", taskId: "t-j0k1l2", email: "eve@example.com", model: "claude-sonnet-4", inputTokens: 4800, outputTokens: 3500, durationMs: 4560, status: "success", errorMsg: null as string | null, createdAt: iso(0, 9, 30) },
  { id: "tr5", taskId: "t-m3n4o5", email: "bob@example.com", model: "qwen-plus", inputTokens: 1800, outputTokens: 1200, durationMs: 1870, status: "success", errorMsg: null as string | null, createdAt: iso(0, 8, 15) },
  { id: "tr6", taskId: "t-p6q7r8", email: "frank@example.com", model: "deepseek-v4", inputTokens: 2100, outputTokens: 0, durationMs: 30000, status: "timeout", errorMsg: "Request timeout after 30s", createdAt: iso(1, 16, 20) },
  { id: "tr7", taskId: "t-s9t0u1", email: "carol@example.com", model: "gpt-4o", inputTokens: 2900, outputTokens: 2100, durationMs: 2780, status: "success", errorMsg: null as string | null, createdAt: iso(1, 15) },
];

export const MOCK_RISK_ALERTS = [
  { type: "burst", count: 3, severity: "high" },
  { type: "failure_rate", count: 1, severity: "medium" },
  { type: "daily_abuse", count: 2, severity: "low" },
];

export const MOCK_RISK_EVENTS = [
  { id: "re1", userId: "u6", email: "frank@example.com", eventType: "burst", detail: "18 requests in 5 min from frank@example.com", status: "open", createdAt: iso(0, 10, 5) },
  { id: "re2", userId: "u1", email: "alice@example.com", eventType: "failure_rate", detail: "60% failure rate in last hour for alice@example.com", status: "open", createdAt: iso(0, 9, 40) },
  { id: "re3", userId: "u2", email: "bob@example.com", eventType: "daily_abuse", detail: "52 AI calls (free limit: 50) by bob@example.com", status: "resolved", createdAt: iso(1, 18) },
  { id: "re4", userId: "u4", email: "dave@example.com", eventType: "burst", detail: "12 requests in 2 min from dave@example.com", status: "resolved", createdAt: iso(2, 14) },
];

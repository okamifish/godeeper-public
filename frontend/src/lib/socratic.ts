import type {
  CanvasNodeSeed,
  SocraticDimension,
  SocraticRound,
  SocraticSession,
} from "@/lib/types";
import { BASE_NODE_WIDTH, NODE_HEIGHT_BY_KIND, WIDTH_BY_KIND } from "@/data/layout-constants";

export const MAX_SOCRATIC_ROUNDS = 5;
const CARD_TITLE_MAX = 40;
const CARD_BODY_MAX = 200;
const CARD_GAP = 56;

export function createSocraticSession(input: {
  id?: string;
  sourceNodeId: string;
  sourceTitle: string;
  sourceBody: string;
  context?: string[];
  now?: string;
}): SocraticSession {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? `socratic-${Date.now()}`,
    sourceNodeId: input.sourceNodeId,
    sourceTitle: input.sourceTitle.slice(0, 80),
    sourceBody: input.sourceBody.slice(0, 1200),
    context: input.context?.slice(0, 12),
    rounds: [],
    status: "asking",
    createdAt: now,
    updatedAt: now,
  };
}

export function buildSocraticRound(input: {
  question: string;
  answer: string;
  card: { title: string; body: string } | null;
  dimension: SocraticDimension;
  now?: string;
}): SocraticRound {
  const answer = input.answer.trim();
  return {
    question: input.question.trim().slice(0, 80),
    answer: answer.slice(0, 2000),
    cardTitle: (input.card?.title || input.question || answer).trim().slice(0, CARD_TITLE_MAX),
    cardBody: (input.card?.body || answer).trim().slice(0, CARD_BODY_MAX),
    dimension: input.dimension,
    createdAt: input.now ?? new Date().toISOString(),
  };
}

export function appendSocraticRound(
  session: SocraticSession,
  round: SocraticRound,
): SocraticSession {
  return {
    ...session,
    rounds: [...session.rounds, round].slice(0, MAX_SOCRATIC_ROUNDS),
    status: "asking",
    updatedAt: round.createdAt,
  };
}

export function socraticHistory(session: SocraticSession): Array<{ question: string; answer: string }> {
  return session.rounds.map((round) => ({ question: round.question, answer: round.answer }));
}

/** 会话画布：每轮一张，纵向排列；不参与主画布坐标。 */
export function buildSocraticCardSeed(input: {
  round: SocraticRound;
  index: number;
  id?: string;
}): CanvasNodeSeed {
  const width = WIDTH_BY_KIND.task ?? BASE_NODE_WIDTH;
  const height = NODE_HEIGHT_BY_KIND.task ?? 360;
  return {
    id: input.id ?? `n-socratic-${input.index}-${input.round.createdAt}`,
    kind: "task",
    title: input.round.cardTitle || input.round.question,
    body: input.round.cardBody,
    x: 0,
    y: input.index * (height + CARD_GAP),
    width,
    taskStatus: "complete",
    taskType: "question",
    author: "ai",
    adopted: true,
    adoptedAt: input.round.createdAt,
    editedByUser: false,
    inspireAction: "socratic",
  };
}

/** 主画布：一张追问卡，承载会话摘要与盲点，可点击继续。 */
export function buildSocraticSummarySeed(input: {
  session: SocraticSession;
  source: { id: string; x: number; y: number; width?: number };
  id?: string;
  x?: number;
  y?: number;
  now?: string;
}): CanvasNodeSeed {
  const { session, source } = input;
  const width = WIDTH_BY_KIND.task ?? BASE_NODE_WIDTH;
  const now = input.now ?? new Date().toISOString();
  const blindSpots = session.blindSpots ?? [];
  const body = [
    session.summary ?? "",
    blindSpots.length > 0 ? "**盲点**" : "",
    ...blindSpots.map((item) => `- ${item}`),
  ].filter(Boolean).join("\n");

  return {
    id: input.id ?? `n-socratic-summary-${Date.now()}`,
    kind: "task",
    title: session.title || `追问：${session.sourceTitle}`,
    body,
    x: input.x ?? source.x + (source.width ?? width) + 80,
    y: input.y ?? source.y,
    width,
    taskStatus: "complete",
    taskType: "question",
    author: "ai",
    adopted: true,
    adoptedAt: now,
    editedByUser: false,
    inspireAction: "socratic",
    summary: session.summary,
    socraticSession: session,
  };
}

export function serializeSocraticDraft(session: SocraticSession | null): string | null {
  return session ? JSON.stringify(session) : null;
}

export function parseSocraticDraft(raw: string | null): SocraticSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SocraticSession>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "string" || typeof parsed.sourceNodeId !== "string") return null;
    if (!Array.isArray(parsed.rounds)) return null;
    return parsed as SocraticSession;
  } catch {
    return null;
  }
}

export function isSocraticResumable(session: SocraticSession | null): session is SocraticSession {
  return Boolean(session && session.status !== "done" && session.rounds.length < MAX_SOCRATIC_ROUNDS);
}

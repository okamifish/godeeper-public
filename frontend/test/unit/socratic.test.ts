import { describe, expect, it } from "vitest";
import {
  MAX_SOCRATIC_ROUNDS,
  appendSocraticRound,
  buildSocraticCardSeed,
  buildSocraticRound,
  buildSocraticSummarySeed,
  createSocraticSession,
  isSocraticResumable,
  parseSocraticDraft,
  serializeSocraticDraft,
  socraticHistory,
} from "@/lib/socratic";

const NOW = "2026-11-09T00:00:00.000Z";

function makeSession() {
  return createSocraticSession({
    id: "session-1",
    sourceNodeId: "node-1",
    sourceTitle: "把速度等同于质量",
    sourceBody: "我认为更快就是更好。",
    now: NOW,
  });
}

describe("socratic session helpers", () => {
  it("creates a session with trimmed source fields", () => {
    const session = makeSession();

    expect(session.id).toBe("session-1");
    expect(session.status).toBe("asking");
    expect(session.rounds).toEqual([]);
    expect(session.sourceTitle).toBe("把速度等同于质量");
    expect(session.sourceBody).toBe("我认为更快就是更好。");
  });

  it("builds a round with bounded card fields", () => {
    const round = buildSocraticRound({
      question: "你说的“更好”具体指什么？",
      answer: "a".repeat(3000),
      card: { title: "t".repeat(100), body: "b".repeat(300) },
      dimension: "definition",
      now: NOW,
    });

    expect(round.question).toBe("你说的“更好”具体指什么？");
    expect(round.answer).toHaveLength(2000);
    expect(round.cardTitle).toHaveLength(40);
    expect(round.cardBody).toHaveLength(200);
    expect(round.dimension).toBe("definition");
  });

  it("falls back to the answer when the card is missing", () => {
    const round = buildSocraticRound({
      question: "有什么反例？",
      answer: "第一次使用时就不成立。",
      card: null,
      dimension: "counterexample",
      now: NOW,
    });

    expect(round.cardTitle).toBe("有什么反例？");
    expect(round.cardBody).toBe("第一次使用时就不成立。");
  });

  it("caps appended rounds at five", () => {
    let session = makeSession();
    for (let index = 0; index < MAX_SOCRATIC_ROUNDS + 2; index += 1) {
      session = appendSocraticRound(session, buildSocraticRound({
        question: `问题 ${index}`,
        answer: `回答 ${index}`,
        card: { title: `卡片 ${index}`, body: `正文 ${index}` },
        dimension: "evidence",
        now: NOW,
      }));
    }

    expect(session.rounds).toHaveLength(MAX_SOCRATIC_ROUNDS);
    expect(session.rounds[MAX_SOCRATIC_ROUNDS - 1].question).toBe("问题 4");
  });

  it("maps session rounds to API history", () => {
    const round = buildSocraticRound({
      question: "Q",
      answer: "A",
      card: { title: "T", body: "B" },
      dimension: "assumption",
      now: NOW,
    });
    const session = appendSocraticRound(makeSession(), round);

    expect(socraticHistory(session)).toEqual([{ question: "Q", answer: "A" }]);
  });

  it("builds one vertically stacked card per round", () => {
    const round = buildSocraticRound({
      question: "Q",
      answer: "A",
      card: { title: "卡片标题", body: "卡片正文" },
      dimension: "definition",
      now: NOW,
    });
    const first = buildSocraticCardSeed({ round, index: 0 });
    const second = buildSocraticCardSeed({ round, index: 1 });

    expect(first.kind).toBe("task");
    expect(first.author).toBe("ai");
    expect(first.inspireAction).toBe("socratic");
    expect(first.title).toBe("卡片标题");
    expect(first.body).toBe("卡片正文");
    expect(second.y).toBeGreaterThan(first.y);
  });

  it("builds a summary card carrying the full session", () => {
    const round = buildSocraticRound({
      question: "Q",
      answer: "A",
      card: { title: "T", body: "B" },
      dimension: "consequence",
      now: NOW,
    });
    const session: ReturnType<typeof makeSession> = {
      ...appendSocraticRound(makeSession(), round),
      status: "done",
      title: "追问：更好是什么",
      summary: "用户发现自己从未定义“更好”。",
      blindSpots: ["没有定义“更好”", "忽略维护成本"],
    };

    const seed = buildSocraticSummarySeed({
      session,
      source: { id: "node-1", x: 100, y: 200, width: 380 },
      id: "summary-1",
      now: NOW,
    });

    expect(seed.id).toBe("summary-1");
    expect(seed.title).toBe("追问：更好是什么");
    expect(seed.body).toContain("用户发现自己从未定义“更好”。");
    expect(seed.body).toContain("- 没有定义“更好”");
    expect(seed.socraticSession).toBe(session);
    expect(seed.x).toBe(560);
  });

  it("round-trips drafts and rejects malformed data", () => {
    const session = makeSession();
    const restored = parseSocraticDraft(serializeSocraticDraft(session));

    expect(restored).toEqual(session);
    expect(parseSocraticDraft(null)).toBeNull();
    expect(parseSocraticDraft("not json")).toBeNull();
    expect(parseSocraticDraft(JSON.stringify({ id: "x" }))).toBeNull();
  });

  it("marks only unfinished sessions as resumable", () => {
    const session = makeSession();
    expect(isSocraticResumable(session)).toBe(true);
    expect(isSocraticResumable({ ...session, status: "done" })).toBe(false);
  });
});

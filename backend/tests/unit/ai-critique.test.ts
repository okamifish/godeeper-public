import { describe, expect, it } from "vitest";
import {
  CritiqueInvalidError,
  normalizeCritiqueFindings,
} from "../../src/services/ai.service";

function run(text: string) {
  return normalizeCritiqueFindings(text);
}

describe("normalizeCritiqueFindings", () => {
  it("keeps all three allowed kinds in order", () => {
    const findings = run(JSON.stringify({
      findings: [
        { kind: "counterexample", title: "Fails below zero", body: "When input is negative the rule breaks." },
        { kind: "flaw", title: "Hidden assumption", body: "It assumes all users retry immediately." },
        { kind: "missing_evidence", title: "No base rate", body: "No data shows how often this happens." },
      ],
    }));

    expect(findings).toEqual([
      { kind: "counterexample", title: "Fails below zero", body: "When input is negative the rule breaks." },
      { kind: "flaw", title: "Hidden assumption", body: "It assumes all users retry immediately." },
      { kind: "missing_evidence", title: "No base rate", body: "No data shows how often this happens." },
    ]);
  });

  it("normalizes kind aliases", () => {
    const findings = run(JSON.stringify({
      findings: [
        { kind: "counter_example", title: "Alias A", body: "body" },
        { kind: "missingEvidence", title: "Alias B", body: "body" },
        { kind: "gap", title: "Alias C", body: "body" },
      ],
    }));

    expect(findings.map((item) => item.kind)).toEqual([
      "counterexample",
      "missing_evidence",
      "flaw",
    ]);
  });

  it("drops unknown kinds, empty fields, and duplicates", () => {
    const findings = run(JSON.stringify({
      findings: [
        { kind: "flaw", title: "Same hole", body: "body" },
        { kind: "flaw", title: "same hole", body: "duplicate title" },
        { kind: "opinion", title: "Unknown kind", body: "body" },
        { kind: "flaw", title: "", body: "empty title" },
        { kind: "flaw", title: "Empty body", body: "   " },
        { kind: "counterexample", title: "Kept", body: "body" },
      ],
    }));

    expect(findings.map((item) => item.title)).toEqual(["Same hole", "Kept"]);
  });

  it("caps findings at five", () => {
    const raw = Array.from({ length: 8 }, (_, i) => ({
      kind: "flaw",
      title: `Finding ${i}`,
      body: "body",
    }));
    const findings = run(JSON.stringify({ findings: raw }));

    expect(findings).toHaveLength(5);
    expect(findings[4].title).toBe("Finding 4");
  });

  it("truncates overlong titles and bodies", () => {
    const findings = run(JSON.stringify({
      findings: [{ kind: "flaw", title: "t".repeat(100), body: "b".repeat(300) }],
    }));

    expect(findings[0].title).toHaveLength(60);
    expect(findings[0].body).toHaveLength(200);
  });

  it("strips markdown code fences", () => {
    const findings = run("```json\n{\"findings\":[{\"kind\":\"flaw\",\"title\":\"T\",\"body\":\"B\"}]}\n```");
    expect(findings).toHaveLength(1);
  });

  it("rejects invalid JSON", () => {
    expect(() => run("not json")).toThrow(CritiqueInvalidError);
  });

  it("rejects when there are no valid findings", () => {
    expect(() => run(JSON.stringify({ findings: [{ kind: "opinion", title: "T", body: "B" }] })))
      .toThrow(CritiqueInvalidError);
    expect(() => run(JSON.stringify({ findings: [] }))).toThrow(CritiqueInvalidError);
  });
});

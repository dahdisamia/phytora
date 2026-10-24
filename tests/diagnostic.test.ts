import { describe, expect, it } from "vitest";
import { diagnose, rankCandidates } from "../shared/diagnostic";
import pests from "../content/pests.json";
import questions from "../content/questions.json";
import recommendations from "../content/recommendations.json";

const data = { pests, questions, recommendations };

describe("diagnostic engine", () => {
  it("never returns numerical percentages", () => {
    const result = diagnose(data as any, "crop-tomato", "dz-eloued", null, null, []);
    const ranked = rankCandidates(data as any, "crop-tomato", "dz-eloued", [], null);
    for (const candidate of ranked) {
      expect(candidate.confidence).not.toMatch(/\d+%/);
    }
  });

  it("does not include red palm weevil as a normal diagnostic candidate for tomato", () => {
    const ranked = rankCandidates(data as any, "crop-tomato", "dz-eloued", [], null);
    const ids = ranked.map((r) => r.pest.id);
    expect(ids).not.toContain("pest-red-palm-weevil");
  });

  it("tuta absoluta can be considered for tomato", () => {
    const ranked = rankCandidates(data as any, "crop-tomato", "dz-eloued", [], null);
    const ids = ranked.map((r) => r.pest.id);
    expect(ids).toContain("pest-tuta-absoluta");
  });
});

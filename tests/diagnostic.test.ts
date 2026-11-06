import { describe, expect, it } from "vitest";
import { assessSeverity } from "../shared/diagnostic";

describe("severity assessment", () => {
  it("returns expert_required for heavy damage", () => {
    const result = assessSeverity({
      growthStage: null,
      damageExtent: "heavy",
      affectedPlants: "some",
      distribution: "patches",
      rapidSpread: "no",
      identificationConfidence: "possible"
    });
    expect(result.level).toBe("expert_required");
  });

  it("returns monitor for light damage", () => {
    const result = assessSeverity({
      growthStage: null,
      damageExtent: "light",
      affectedPlants: "few",
      distribution: "few_spots",
      rapidSpread: "no",
      identificationConfidence: "likely"
    });
    expect(result.level).toBe("monitor");
  });
});

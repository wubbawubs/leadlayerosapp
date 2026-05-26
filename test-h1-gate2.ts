import { evaluateText } from "./src/lib/shared/tone/evaluator.server";
import { EMPTY_TONE_PROFILE } from "./src/lib/shared/tone/schemas";

async function run() {
  const profile = {
    ...EMPTY_TONE_PROFILE,
    scoringWeights: {
      voiceFit: 0.2,
      vocabularyFit: 0.15,
      sentenceRhythmFit: 0.15,
      claimSafety: 0.2,
      ctaFit: 0.1,
      localeFit: 0.1,
      genericnessRisk: 0.1,
    },
    localeTone: { locale: "en-US", salesIntensity: "medium" },
  };

  const cases = [
    { text: "Your Dallas Home Comfort, Simply Explained", expected: "needs_review", kind: "h1" as const },
    { text: "Clear HVAC Help for Dallas Homeowners", expected: "publishable", kind: "h1" as const },
    { text: "AC Repair and HVAC Service in Dallas, TX", expected: "publishable", kind: "h1" as const },
  ];

  for (const c of cases) {
    const result = await evaluateText(c.text, profile as any, { kind: c.kind, targetLocale: "en-US" });
    const flags = result.riskFlags.join("; ");
    const ok = result.verdict === c.expected;
    console.log(`${ok ? "✅" : "❌"} "${c.text}"`);
    console.log(`   verdict: ${result.verdict} (expected: ${c.expected})`);
    console.log(`   weighted: ${result.weighted}`);
    console.log(`   score: ${JSON.stringify(result.score)}`);
    console.log(`   flags: ${flags || "(none)"}`);
    console.log("");
  }
}
run().catch(console.error);

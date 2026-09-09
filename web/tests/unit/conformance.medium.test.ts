import { describeConformance } from "./conformanceCases";

// One difficulty per file so Vitest can run the three in parallel; see
// conformanceCases.ts for what these cases are and why they are split.
describeConformance("medium");

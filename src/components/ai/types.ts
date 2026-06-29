// Client-facing shapes for the AI-generated backlog tree. These mirror the
// normalized tree the aiService stores/returns (kept separate so client
// components don't import server code).

export type GenStep = {
  stepNumber: number;
  action: string;
  expectedResult: string;
};

export type GenTestCase = {
  title: string;
  preconditions: string | null;
  steps: GenStep[];
  expectedResult: string | null;
  priority: string;
};

export type GenStory = {
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  edgeCases: string | null;
  priority: string;
  storyPoints: number | null;
  testCases: GenTestCase[];
};

export type GenFeature = {
  title: string;
  description: string | null;
  stories: GenStory[];
};

export type GenEpic = {
  title: string;
  description: string | null;
  features: GenFeature[];
};

export type GeneratedBacklog = { epics: GenEpic[] };

export type GenerationSummaryCounts = {
  epics: number;
  features: number;
  stories: number;
  testCases: number;
};

export type GenerationSummary = {
  id: string;
  status: "DRAFT" | "EDITED" | "APPROVED" | "REJECTED" | "ARCHIVED";
  provider: string;
  model: string;
  tokenCount: number | null;
  reviewNote: string | null;
  createdAt: string;
  generatedByName: string | null;
  createdEntityCount: number;
  summary: GenerationSummaryCounts;
  output: GeneratedBacklog;
};

export function summaryLine(c: GenerationSummaryCounts): string {
  return `${c.epics} ${plural(c.epics, "epic")}, ${c.features} ${plural(
    c.features,
    "feature",
  )}, ${c.stories} ${plural(c.stories, "story", "stories")}, ${c.testCases} ${plural(
    c.testCases,
    "test case",
  )}`;
}

function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}

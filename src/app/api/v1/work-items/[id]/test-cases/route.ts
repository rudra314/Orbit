// Routing binding only — adapter lives in the api/v1 layer.
import { listTestCasesHandler, createTestCaseHandler } from "@/api/v1/testCases";

export const GET = listTestCasesHandler;
export const POST = createTestCaseHandler;

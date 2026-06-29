// Routing binding only — adapter lives in the api/v1 layer.
import { generateTestCasesHandler } from "@/api/v1/testCases";

export const POST = generateTestCasesHandler;

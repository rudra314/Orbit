// Routing binding only — adapter lives in the api/v1 layer.
import { updateTestCaseHandler } from "@/api/v1/testCases";

export const PATCH = updateTestCaseHandler;

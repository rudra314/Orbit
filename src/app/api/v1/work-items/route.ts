// Routing binding only — adapter lives in the api/v1 layer.
import { createWorkItemHandler } from "@/api/v1/workItems";

export const POST = createWorkItemHandler;

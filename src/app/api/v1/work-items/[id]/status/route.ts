// Routing binding only — adapter lives in the api/v1 layer.
import { moveWorkItemHandler } from "@/api/v1/workItems";

export const PATCH = moveWorkItemHandler;

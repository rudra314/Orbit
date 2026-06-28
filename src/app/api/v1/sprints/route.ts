// Routing binding only — adapter lives in the api/v1 layer.
import { createSprintHandler } from "@/api/v1/sprints";

export const POST = createSprintHandler;

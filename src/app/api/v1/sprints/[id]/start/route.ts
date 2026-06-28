// Routing binding only — adapter lives in the api/v1 layer.
import { startSprintHandler } from "@/api/v1/sprints";

export const POST = startSprintHandler;

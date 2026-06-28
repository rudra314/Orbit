// Routing binding only — adapter lives in the api/v1 layer.
import { updateSprintHandler, deleteSprintHandler } from "@/api/v1/sprints";

export const PATCH = updateSprintHandler;
export const DELETE = deleteSprintHandler;

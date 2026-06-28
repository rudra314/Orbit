// Routing binding only — adapter lives in the api/v1 layer.
import { updateEpicHandler } from "@/api/v1/epics";

export const PATCH = updateEpicHandler;

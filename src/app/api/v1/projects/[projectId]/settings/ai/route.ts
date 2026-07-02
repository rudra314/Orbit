// Routing binding only — adapter lives in the api/v1 layer.
import { updateAiHandler } from "@/api/v1/settings";

export const PATCH = updateAiHandler;

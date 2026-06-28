// Routing binding only — adapter lives in the api/v1 layer.
import { createEpicHandler } from "@/api/v1/epics";

export const POST = createEpicHandler;

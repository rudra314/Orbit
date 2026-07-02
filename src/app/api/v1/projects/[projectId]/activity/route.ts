// Routing binding only — adapter lives in the api/v1 layer.
import { projectActivityHandler } from "@/api/v1/activity";

export const GET = projectActivityHandler;

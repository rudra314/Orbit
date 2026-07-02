// Routing binding only — adapter lives in the api/v1 layer.
import { workItemActivityHandler } from "@/api/v1/activity";

export const GET = workItemActivityHandler;

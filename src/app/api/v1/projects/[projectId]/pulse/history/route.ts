// Routing binding only — adapter lives in the api/v1 layer.
import { getPulseHistoryHandler } from "@/api/v1/pulse";

export const GET = getPulseHistoryHandler;

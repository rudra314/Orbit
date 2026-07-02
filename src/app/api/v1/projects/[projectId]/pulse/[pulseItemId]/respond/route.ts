// Routing binding only — adapter lives in the api/v1 layer.
import { respondToPulseBlockerHandler } from "@/api/v1/pulse";

export const POST = respondToPulseBlockerHandler;

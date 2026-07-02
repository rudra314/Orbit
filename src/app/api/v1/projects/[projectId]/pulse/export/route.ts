// Routing binding only — adapter lives in the api/v1 layer.
import { exportPulseDigestHandler } from "@/api/v1/pulse";

export const GET = exportPulseDigestHandler;

// Routing binding only — adapter lives in the api/v1 layer.
import { getPulseDigestHandler } from "@/api/v1/pulse";

export const GET = getPulseDigestHandler;

// Routing binding only — adapter lives in the api/v1 layer.
import { getPulseTodayHandler } from "@/api/v1/pulse";

export const GET = getPulseTodayHandler;

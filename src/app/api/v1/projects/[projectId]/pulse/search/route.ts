// Routing binding only — adapter lives in the api/v1 layer.
import { searchPulseItemsHandler } from "@/api/v1/pulse";

export const GET = searchPulseItemsHandler;

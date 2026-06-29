// Routing binding only — adapter lives in the api/v1 layer.
import { rejectHandler } from "@/api/v1/ai";

export const POST = rejectHandler;

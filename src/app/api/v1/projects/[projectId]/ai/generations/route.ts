// Routing binding only — adapter lives in the api/v1 layer.
import { listGenerationsHandler } from "@/api/v1/ai";

export const GET = listGenerationsHandler;

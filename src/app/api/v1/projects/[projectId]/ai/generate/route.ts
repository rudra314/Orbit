// Routing binding only — adapter lives in the api/v1 layer.
import { generateHandler } from "@/api/v1/ai";

export const POST = generateHandler;

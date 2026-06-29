// Routing binding only — adapter lives in the api/v1 layer.
import { approveHandler } from "@/api/v1/ai";

export const POST = approveHandler;

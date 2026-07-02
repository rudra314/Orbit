// Routing binding only — adapter lives in the api/v1 layer.
import { markReadHandler } from "@/api/v1/notifications";

export const POST = markReadHandler;

// Routing binding only — adapter lives in the api/v1 layer.
import { archiveHandler } from "@/api/v1/settings";

export const POST = archiveHandler;

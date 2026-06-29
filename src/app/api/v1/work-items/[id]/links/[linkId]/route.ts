// Routing binding only — adapter lives in the api/v1 layer.
import { removeLinkHandler } from "@/api/v1/links";

export const DELETE = removeLinkHandler;

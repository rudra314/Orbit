// Routing binding only — adapter lives in the api/v1 layer.
import { listLinksHandler, createLinkHandler } from "@/api/v1/links";

export const GET = listLinksHandler;
export const POST = createLinkHandler;

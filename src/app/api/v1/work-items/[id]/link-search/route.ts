// Routing binding only — adapter lives in the api/v1 layer.
import { searchLinkTargetsHandler } from "@/api/v1/links";

export const GET = searchLinkTargetsHandler;

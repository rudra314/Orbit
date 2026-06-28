// Routing binding only — adapter lives in the api/v1 layer.
import { bulkWorkItemsHandler } from "@/api/v1/workItems";

export const POST = bulkWorkItemsHandler;

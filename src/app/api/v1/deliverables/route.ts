// Routing binding only — adapter lives in the api/v1 layer.
import { createDeliverableHandler } from "@/api/v1/deliverables";

export const POST = createDeliverableHandler;

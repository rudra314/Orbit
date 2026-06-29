// Routing binding only — adapter lives in the api/v1 layer.
import {
  updateDeliverableHandler,
  deleteDeliverableHandler,
} from "@/api/v1/deliverables";

export const PATCH = updateDeliverableHandler;
export const DELETE = deleteDeliverableHandler;

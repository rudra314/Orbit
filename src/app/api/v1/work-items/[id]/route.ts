// Routing binding only — adapter lives in the api/v1 layer.
import {
  updateWorkItemHandler,
  deleteWorkItemHandler,
} from "@/api/v1/workItems";

export const PATCH = updateWorkItemHandler;
export const DELETE = deleteWorkItemHandler;

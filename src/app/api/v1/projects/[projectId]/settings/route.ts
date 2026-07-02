// Routing binding only — adapter lives in the api/v1 layer.
import { deleteProjectHandler } from "@/api/v1/settings";

export const DELETE = deleteProjectHandler;

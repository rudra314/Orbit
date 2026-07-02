// Routing binding only — adapter lives in the api/v1 layer.
import { markAllReadHandler } from "@/api/v1/notifications";

export const POST = markAllReadHandler;

// Routing binding only — adapter lives in the api/v1 layer.
import { listNotificationsHandler } from "@/api/v1/notifications";

export const GET = listNotificationsHandler;

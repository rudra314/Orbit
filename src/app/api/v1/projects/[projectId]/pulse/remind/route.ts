// Routing binding only — adapter lives in the api/v1 layer.
import { sendPulseReminderHandler } from "@/api/v1/pulse";

export const POST = sendPulseReminderHandler;

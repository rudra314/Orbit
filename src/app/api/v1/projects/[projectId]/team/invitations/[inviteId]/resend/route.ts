// Routing binding only — adapter lives in the api/v1 layer.
import { resendInviteHandler } from "@/api/v1/team";

export const POST = resendInviteHandler;

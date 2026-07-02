// Routing binding only — adapter lives in the api/v1 layer.
import { inviteHandler } from "@/api/v1/team";

export const POST = inviteHandler;

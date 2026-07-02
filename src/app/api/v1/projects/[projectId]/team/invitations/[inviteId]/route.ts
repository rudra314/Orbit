// Routing binding only — adapter lives in the api/v1 layer.
import { cancelInviteHandler } from "@/api/v1/team";

export const DELETE = cancelInviteHandler;

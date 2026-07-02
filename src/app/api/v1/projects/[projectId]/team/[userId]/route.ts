// Routing binding only — adapter lives in the api/v1 layer.
import { updateMemberHandler, removeMemberHandler } from "@/api/v1/team";

export const PATCH = updateMemberHandler;
export const DELETE = removeMemberHandler;

// Routing binding only — adapter lives in the api/v1 layer.
import { getTeamHandler } from "@/api/v1/team";

export const GET = getTeamHandler;

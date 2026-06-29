// Routing binding only — adapter lives in the api/v1 layer.
import { getDashboardHandler } from "@/api/v1/dashboard";

export const GET = getDashboardHandler;

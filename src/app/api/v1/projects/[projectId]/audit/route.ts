// Routing binding only — adapter lives in the api/v1 layer.
import { listAuditHandler } from "@/api/v1/audit";

export const GET = listAuditHandler;

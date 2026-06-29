// Routing binding only — adapter lives in the api/v1 layer.
import { getReportHandler, updateReportHandler } from "@/api/v1/reports";

export const GET = getReportHandler;
export const PATCH = updateReportHandler;

// Routing binding only — adapter lives in the api/v1 layer.
import { archiveReportHandler } from "@/api/v1/reports";

export const POST = archiveReportHandler;

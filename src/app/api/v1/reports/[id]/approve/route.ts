// Routing binding only — adapter lives in the api/v1 layer.
import { approveReportHandler } from "@/api/v1/reports";

export const POST = approveReportHandler;

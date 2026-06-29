// Routing binding only — adapter lives in the api/v1 layer.
import { parseImportHandler } from "@/api/v1/import";

export const POST = parseImportHandler;

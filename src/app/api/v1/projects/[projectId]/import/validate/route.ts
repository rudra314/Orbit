// Routing binding only — adapter lives in the api/v1 layer.
import { validateImportHandler } from "@/api/v1/import";

export const POST = validateImportHandler;

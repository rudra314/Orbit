// Routing binding only — adapter lives in the api/v1 layer.
import { createFeatureHandler } from "@/api/v1/features";

export const POST = createFeatureHandler;

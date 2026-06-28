// Routing binding only — adapter lives in the api/v1 layer.
import { updateFeatureHandler } from "@/api/v1/features";

export const PATCH = updateFeatureHandler;

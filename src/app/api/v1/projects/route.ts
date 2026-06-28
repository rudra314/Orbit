// Routing binding only — the adapter lives in the api/v1 layer.
import { createProjectHandler } from "@/api/v1/projects";

export const POST = createProjectHandler;

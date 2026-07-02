// Routing binding only — adapter lives in the api/v1 layer.
import {
  updateCommentHandler,
  deleteCommentHandler,
} from "@/api/v1/comments";

export const PATCH = updateCommentHandler;
export const DELETE = deleteCommentHandler;

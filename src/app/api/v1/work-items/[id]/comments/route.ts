// Routing binding only — adapter lives in the api/v1 layer.
import {
  listCommentsHandler,
  createCommentHandler,
} from "@/api/v1/comments";

export const GET = listCommentsHandler;
export const POST = createCommentHandler;

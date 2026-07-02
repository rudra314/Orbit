import { describe, it, expect, vi } from "vitest";

vi.mock("@/repositories/sprintRepository", () => ({
  sprintRepository: {
    findProjectId: vi.fn(),
  },
}));

import { sprintRepository } from "@/repositories/sprintRepository";
import { assertSprintInProject } from "./workItemService";

const findProjectId = vi.mocked(sprintRepository.findProjectId);

describe("assertSprintInProject", () => {
  it("resolves when the sprint belongs to the given project", async () => {
    findProjectId.mockResolvedValueOnce({
      id: "sprint-1",
      projectId: "project-a",
      status: "ACTIVE",
      name: "Sprint 1",
    } as never);

    await expect(
      assertSprintInProject("sprint-1", "project-a"),
    ).resolves.toBeUndefined();
  });

  it("rejects a sprint belonging to a different project", async () => {
    findProjectId.mockResolvedValueOnce({
      id: "sprint-1",
      projectId: "project-b",
      status: "ACTIVE",
      name: "Sprint 1",
    } as never);

    await expect(
      assertSprintInProject("sprint-1", "project-a"),
    ).rejects.toThrow("Sprint does not belong to this project.");
  });

  it("rejects a sprint id that doesn't exist", async () => {
    findProjectId.mockResolvedValueOnce(null);

    await expect(
      assertSprintInProject("missing-sprint", "project-a"),
    ).rejects.toThrow("Sprint does not belong to this project.");
  });
});

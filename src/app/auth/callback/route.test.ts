import { describe, it, expect } from "vitest";
import { isInternalPath } from "./route";

describe("isInternalPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(isInternalPath("/")).toBe(true);
    expect(isInternalPath("/orb/board")).toBe(true);
    expect(isInternalPath("/setup/new")).toBe(true);
  });

  it("rejects the userinfo bypass (next=@evil.com)", () => {
    // ${origin}${next} => "http://host@evil.com" -> hostname is evil.com.
    expect(isInternalPath("@evil.com")).toBe(false);
  });

  it("rejects protocol-relative paths", () => {
    expect(isInternalPath("//evil.com")).toBe(false);
  });

  it("rejects absolute URLs", () => {
    expect(isInternalPath("https://evil.com")).toBe(false);
    expect(isInternalPath("http://evil.com/board")).toBe(false);
  });
});

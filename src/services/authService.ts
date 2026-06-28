import { userRepository } from "@/repositories/userRepository";

// Auth provisioning. This is the bootstrap path that runs for the
// authenticated user themselves, so no permissionService check applies.
export const authService = {
  // Called on every successful login. Creates the User row on first login,
  // otherwise just records the login. Idempotent by email.
  async ensureUser(input: {
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
  }) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      return userRepository.updateLastLogin(existing.id);
    }
    const name = input.name?.trim() || input.email.split("@")[0];
    return userRepository.create({
      email: input.email,
      name,
      avatarUrl: input.avatarUrl ?? null,
    });
  },

  getByEmail(email: string) {
    return userRepository.findByEmail(email);
  },
};

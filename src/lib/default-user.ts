import { db } from "./db";

/**
 * Single-user local mode: there is exactly one default user.
 * Created lazily on first API call. All data belongs to this user.
 */
export async function getDefaultUser() {
  let user = await db.user.findFirst({
    where: { isDefault: true },
  });
  if (!user) {
    user = await db.user.create({
      data: {
        name: "صانع الحياة",
        email: "default@riseos.local",
        isDefault: true,
        settings: { create: {} },
      },
    });
  }
  return user;
}

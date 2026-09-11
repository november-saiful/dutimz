import { describe, expect, it } from "vitest";
import {
  roleLevel,
  hasRole,
  hasAnyRole,
  isAdminRole,
  isModeratorRole,
  isEditorRole,
  requiredRoleForPath,
  isAuthRoute,
  buildLoginRedirectPath,
} from "@/lib/auth/rbac";

describe("roleLevel", () => {
  it("ranks roles by hierarchy", () => {
    expect(roleLevel("visitor")).toBe(1);
    expect(roleLevel("reporter")).toBe(2);
    expect(roleLevel("moderator")).toBe(3);
    expect(roleLevel("admin")).toBe(4);
  });

  it("ranks missing/unknown roles at 0", () => {
    expect(roleLevel(null)).toBe(0);
    expect(roleLevel(undefined)).toBe(0);
    expect(roleLevel("")).toBe(0);
    expect(roleLevel("superadmin")).toBe(0);
  });
});

describe("hasRole", () => {
  it("satisfies equal and higher roles", () => {
    expect(hasRole("moderator", "reporter")).toBe(true);
    expect(hasRole("moderator", "moderator")).toBe(true);
    expect(hasRole("admin", "moderator")).toBe(true);
  });

  it("rejects lower roles", () => {
    expect(hasRole("visitor", "reporter")).toBe(false);
    expect(hasRole("reporter", "moderator")).toBe(false);
  });

  it("treats anonymous users as level 0", () => {
    expect(hasRole(null, "visitor")).toBe(false);
  });
});

describe("hasAnyRole", () => {
  it("matches any listed role", () => {
    expect(hasAnyRole("reporter", ["moderator", "reporter"])).toBe(true);
    expect(hasAnyRole("visitor", ["moderator", "reporter"])).toBe(false);
    expect(hasAnyRole(null, ["visitor"])).toBe(false);
  });
});

describe("convenience predicates", () => {
  it("editor includes reporter+", () => {
    expect(isEditorRole("visitor")).toBe(false);
    expect(isEditorRole("reporter")).toBe(true);
    expect(isEditorRole("admin")).toBe(true);
  });

  it("moderator includes moderator+", () => {
    expect(isModeratorRole("reporter")).toBe(false);
    expect(isModeratorRole("moderator")).toBe(true);
  });

  it("admin is admin only", () => {
    expect(isAdminRole("moderator")).toBe(false);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole(null)).toBe(false);
  });
});

describe("requiredRoleForPath", () => {
  it("guards dashboard prefixes by role", () => {
    expect(requiredRoleForPath("/admin/dashboard")).toBe("admin");
    expect(requiredRoleForPath("/admin")).toBe("admin");
    expect(requiredRoleForPath("/moderator/comments")).toBe("moderator");
    expect(requiredRoleForPath("/reporter/contents/new")).toBe("reporter");
  });

  it("requires authentication (visitor) for user pages", () => {
    expect(requiredRoleForPath("/profile")).toBe("visitor");
    expect(requiredRoleForPath("/profile/settings")).toBe("visitor");
    expect(requiredRoleForPath("/bookmarks")).toBe("visitor");
  });

  it("does not treat prefixes as whole-path matches", () => {
    // "/profilex" is not a "/profile" page.
    expect(requiredRoleForPath("/profilex")).toBe(null);
  });

  it("returns null for public routes", () => {
    expect(requiredRoleForPath("/")).toBe(null);
    expect(requiredRoleForPath("/news/some-slug")).toBe(null);
    expect(requiredRoleForPath("/category/sports")).toBe(null);
    expect(requiredRoleForPath("/search")).toBe(null);
    expect(requiredRoleForPath("/auth/login")).toBe(null);
  });
});

describe("isAuthRoute", () => {
  it("matches login and register", () => {
    expect(isAuthRoute("/auth/login")).toBe(true);
    expect(isAuthRoute("/auth/register")).toBe(true);
    expect(isAuthRoute("/auth/login?next=/profile")).toBe(false); // pathname only
  });

  it("rejects other paths", () => {
    expect(isAuthRoute("/auth/callback")).toBe(false);
    expect(isAuthRoute("/")).toBe(false);
  });
});

describe("buildLoginRedirectPath", () => {
  it("carries the intended destination", () => {
    expect(buildLoginRedirectPath("/profile", "?tab=security")).toBe(
      "/auth/login?next=%2Fprofile%3Ftab%3Dsecurity",
    );
    expect(buildLoginRedirectPath("/admin/users", null)).toBe(
      "/auth/login?next=%2Fadmin%2Fusers",
    );
  });

  it("falls back to plain login", () => {
    expect(buildLoginRedirectPath(null, null)).toBe("/auth/login");
  });
});

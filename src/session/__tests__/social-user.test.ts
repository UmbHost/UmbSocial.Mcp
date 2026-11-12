import { describe, expect, it } from "@jest/globals";
import { can, HASHTAGS_READ, READ, READ_POST, toSocialUser } from "../social-user.js";

describe("the Social user", () => {
  it("verbs_come_from_fallback_permissions", () => {
    const user = toSocialUser({
      allowedSections: ["Umb.Section.Content", "UmbSocial.Section"],
      fallbackPermissions: ["Umb.Document.Read", "UmbSocial.View", "UmbSocial.Write"],
    });

    expect(user.hasSection).toBe(true);
    expect([...(user.verbs ?? [])].sort()).toEqual(["View", "Write"]);
    expect(can(user, ...READ)).toBe(true);
    expect(can(user, ...READ_POST)).toBe(true);
    expect(can(user, ...HASHTAGS_READ)).toBe(true);
    expect(can(user, "Schedule")).toBe(false);
    expect(can(user, "ManageSettings")).toBe(false);
  });

  it("unknown_verbs_fall_back_to_the_section", () => {
    const unread = toSocialUser({ allowedSections: ["UmbSocial.Section"] });
    expect(unread.verbs).toBeNull();
    expect(can(unread, "Approve")).toBe(true);

    const unknown = toSocialUser({ allowedSections: ["UmbSocial.Section"], fallbackPermissions: ["UmbSocial.Foo"] });
    expect(unknown.verbs?.size).toBe(0);
    expect(can(unknown, ...READ)).toBe(false);

    const noSection = toSocialUser({ allowedSections: ["Umb.Section.Content"], fallbackPermissions: ["UmbSocial.View"] });
    expect(noSection.hasSection).toBe(false);
    expect(can(noSection, "View")).toBe(false);
    expect(can(toSocialUser({ allowedSections: [] }), "View")).toBe(false);
  });

  it("no_verbs_means_the_section_alone", () => {
    // As SocialPolicies.Section: any user with the section, whatever their verbs.
    expect(can(toSocialUser({ allowedSections: ["UmbSocial.Section"], fallbackPermissions: [] }))).toBe(true);
    expect(can(toSocialUser({ allowedSections: ["Umb.Section.Content"], fallbackPermissions: ["UmbSocial.View"] }))).toBe(false);
  });
});

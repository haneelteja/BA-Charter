import { describe, expect, it } from "vitest";
import { getFailedPasswordRules, isValidEmail, PASSWORD_MIN_LENGTH, PASSWORD_RULES } from "./validation";

describe("PASSWORD_RULES", () => {
  it("has exactly the five rules the sign-up checklist renders", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
      "length",
      "uppercase",
      "lowercase",
      "number",
      "special",
    ]);
  });

  it.each([
    ["length", "short", false],
    ["length", "longenough", true],
    ["uppercase", "nocaps1!", false],
    ["uppercase", "HasCaps1!", true],
    ["lowercase", "ALLCAPS1!", false],
    ["lowercase", "hasLower1!", true],
    ["number", "NoDigitsHere!", false],
    ["number", "HasDigit1!", true],
    ["special", "NoSpecial1", false],
    ["special", "HasSpecial1!", true],
  ])("rule %s: test(%j) === %s", (id, password, expected) => {
    const rule = PASSWORD_RULES.find((r) => r.id === id)!;
    expect(rule.test(password)).toBe(expected);
  });
});

describe("getFailedPasswordRules", () => {
  it("returns every rule's label for an empty password", () => {
    expect(getFailedPasswordRules("")).toHaveLength(PASSWORD_RULES.length);
  });

  it("returns nothing for a password meeting every rule", () => {
    expect(getFailedPasswordRules("Correct7!horse")).toEqual([]);
  });

  it("names exactly the rules that are unmet, not the ones that are", () => {
    // 8+ chars, lowercase only — fails uppercase/number/special, passes length+lowercase.
    const failed = getFailedPasswordRules("weakweak");
    expect(failed).toEqual(["One uppercase letter", "One number", "One special character"]);
  });

  it(`enforces the documented minimum length (${PASSWORD_MIN_LENGTH})`, () => {
    const justUnder = "A1!" + "a".repeat(PASSWORD_MIN_LENGTH - 4);
    const justAt = "A1!" + "a".repeat(PASSWORD_MIN_LENGTH - 3);
    expect(getFailedPasswordRules(justUnder)).toContain(`At least ${PASSWORD_MIN_LENGTH} characters`);
    expect(getFailedPasswordRules(justAt)).not.toContain(`At least ${PASSWORD_MIN_LENGTH} characters`);
  });
});

describe("isValidEmail", () => {
  it.each([
    ["not-an-email", false],
    ["missing-at-sign.com", false],
    ["no-domain@", false],
    ["@no-local.com", false],
    ["no-tld@example", false],
    ["spaces not allowed@example.com", false],
    ["valid@example.com", true],
    ["pega2023test@gmail.com", true],
    ["first.last+tag@sub.example.co.uk", true],
  ])("isValidEmail(%j) === %s", (input, expected) => {
    expect(isValidEmail(input)).toBe(expected);
  });
});

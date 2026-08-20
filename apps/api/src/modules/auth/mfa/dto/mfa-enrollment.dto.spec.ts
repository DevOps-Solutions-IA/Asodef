import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { BeginMfaEnrollmentDto } from "./begin-mfa-enrollment.dto";
import { ConfirmMfaEnrollmentDto } from "./confirm-mfa-enrollment.dto";

describe("MFA enrollment DTOs", () => {
  it("rejects beginning enrollment without the current password", async () => {
    const dto = plainToInstance(BeginMfaEnrollmentDto, {});
    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it("rejects confirmation without the current password or a six-digit code", async () => {
    const missingPassword = plainToInstance(ConfirmMfaEnrollmentDto, { code: "123456" });
    const malformedCode = plainToInstance(ConfirmMfaEnrollmentDto, {
      password: "Administrative-Password-99!",
      code: "not-a-code",
    });
    await expect(validate(missingPassword)).resolves.not.toHaveLength(0);
    await expect(validate(malformedCode)).resolves.not.toHaveLength(0);
  });

  it("accepts the bounded enrollment request contract", async () => {
    const begin = plainToInstance(BeginMfaEnrollmentDto, { password: "Administrative-Password-99!" });
    const confirm = plainToInstance(ConfirmMfaEnrollmentDto, {
      password: "Administrative-Password-99!",
      code: "123456",
    });
    await expect(validate(begin)).resolves.toHaveLength(0);
    await expect(validate(confirm)).resolves.toHaveLength(0);
  });
});

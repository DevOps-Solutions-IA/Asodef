import { registerDecorator, type ValidationOptions, type ValidationArguments } from "class-validator";

/** Declarative cross-field equality check (e.g. confirmPassword must
 * equal newPassword), enforced by the existing global ValidationPipe -
 * no special-casing needed in controllers/services. */
export function Match(property: string, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: "match",
      target: object.constructor,
      propertyName,
      options: { message: "Las contraseñas no coinciden.", ...validationOptions },
      constraints: [property],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return value === relatedValue;
        },
      },
    });
  };
}

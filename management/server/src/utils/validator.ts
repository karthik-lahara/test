import { BadRequestError } from "@utils/errors";
import Ajv, { ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import addKeywords from "ajv-keywords";

const ajv = new Ajv({ allErrors: true, coerceTypes: true });
ajv.addFormat("objectId", /^[a-fA-F0-9]{24}$/);
addKeywords(ajv, ["uniqueItemProperties"]);
addFormats(ajv);

// Cache compiled schemas so each schema is compiled only once
const cache = new WeakMap<object, ValidateFunction>();

export function validateWithSchema<T>(schema: object, data: unknown): T {
  let validate = cache.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    cache.set(schema, validate);
  }
  if (!validate(data)) {
    const errorMessages = (validate.errors || [])
      .map((e) => {
        const field = e.instancePath || "body";
        // Name the unexpected field, e.g. "body must NOT have additional property 'fullName'"
        if (e.keyword === "additionalProperties") {
          return `${field} must NOT have additional property '${(e.params as { additionalProperty: string }).additionalProperty}'`;
        }
        return `${field} ${e.message}`;
      })
      .join(", ");
    throw new BadRequestError(`Validation error: ${errorMessages}`);
  }
  return data as T;
}

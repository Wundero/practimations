import { Decimal } from "decimal.js";
import superjson from "superjson";

export function registerDecimal() {
  superjson.registerCustom(
    {
      isApplicable(v): v is Decimal {
        return Decimal.isDecimal(v);
      },
      deserialize(v) {
        if (v === null || v === undefined) {
          return v;
        }
        if (v instanceof Decimal) {
          return v;
        }
        if (typeof v === "string" || typeof v === "number") {
          return new Decimal(v);
        }
        return null;
      },
      serialize(v) {
        if (!v) {
          return null;
        }
        return v.toString();
      },
    },
    "decimal",
  );
}

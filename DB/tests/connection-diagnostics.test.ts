import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionFailure } from "../scripts/check-connection.ts";

test("TLS failures provide CA/hostname guidance without leaking raw messages", () => {
  const secret = "postgresql://private-user:private-password@private-host/database";
  const result = connectionFailure({ code: "SELF_SIGNED_CERT_IN_CHAIN", message: secret });
  assert.match(result, /sslrootcert/);
  assert(!result.includes(secret));
  assert.match(connectionFailure({ cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID", message: secret } }), /hostname mismatch/);
});
test("aggregate network errors and auth failures are distinguished from TLS", () => {
  assert.match(connectionFailure({ errors: [{ code: "ENETUNREACH" }] }), /Session pooler/);
  assert.match(connectionFailure({ code: "ENOTFOUND" }), /DNS/);
  assert.match(connectionFailure({ code: "28P01" }), /password/);
});
test("unknown codes, certificate paths and cyclic errors are not exposed", () => {
  const error = { code: "private-secret", message: "private-secret", cause: undefined as unknown };
  error.cause = error;
  const result = connectionFailure(error);
  assert.match(result, /UNKNOWN/);
  assert(!result.includes("private-secret"));
  assert(!connectionFailure({ code: "ENOENT", path: "private-file" }).includes("private-file"));
});

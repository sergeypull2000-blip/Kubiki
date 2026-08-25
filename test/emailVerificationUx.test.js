import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  EXPIRED_VERIFICATION_MESSAGE,
  consumeVerificationCallbackError,
  readVerificationCallbackError,
} from "../src/verificationCallback.js";

test("expired and invalid verification callbacks map to the friendly recovery state", () => {
  assert.equal(readVerificationCallbackError("?error=TOKEN_EXPIRED"), "token_expired");
  assert.equal(readVerificationCallbackError("?error=invalid_token"), "invalid_token");
  assert.equal(readVerificationCallbackError("?error=unrelated"), null);
  assert.equal(EXPIRED_VERIFICATION_MESSAGE, "Ссылка для подтверждения устарела. Запросите новое письмо и используйте ссылку из него.");

  const replacements = [];
  const error = consumeVerificationCallbackError({
    location: {
      search: "?error=invalid_token&source=email",
      href: "https://kubiki.example/?error=invalid_token&source=email#workspace",
    },
    history: { replaceState: (...args) => replacements.push(args) },
  });
  assert.equal(error, "invalid_token");
  assert.deepEqual(replacements, [[{}, "", "/?source=email#workspace"]]);
});

test("verification callback recovery UI offers resend and return to sign-in", () => {
  const source = fs.readFileSync(new URL("../src/AuthScreen.jsx", import.meta.url), "utf8");
  assert.match(source, /verificationError \? 'verification-error'/);
  assert.match(source, /EXPIRED_VERIFICATION_MESSAGE/);
  assert.match(source, /Отправить новое письмо/);
  assert.match(source, /switchView\('signin'\)/);
});

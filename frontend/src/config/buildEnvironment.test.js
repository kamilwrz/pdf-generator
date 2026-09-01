import assert from "node:assert/strict";
import test from "node:test";
import { assertBuildEnvironment } from "./buildEnvironment.js";

test("production build requires an explicit HTTPS API URL", () => {
  assert.throws(
    () => assertBuildEnvironment({ command: "build", mode: "production", env: {} }),
    /VITE_API_URL is required/,
  );
  assert.throws(
    () => assertBuildEnvironment({
      command: "build",
      mode: "production",
      env: { VITE_API_URL: "http://api.example.test" },
    }),
    /must use HTTPS/,
  );
  assert.doesNotThrow(() => assertBuildEnvironment({
    command: "build",
    mode: "production",
    env: { VITE_API_URL: "https://api.example.test" },
  }));
});

test("development and serve commands retain their existing fallback", () => {
  assert.doesNotThrow(() => assertBuildEnvironment({
    command: "serve",
    mode: "production",
    env: {},
  }));
  assert.doesNotThrow(() => assertBuildEnvironment({
    command: "build",
    mode: "development",
    env: {},
  }));
});

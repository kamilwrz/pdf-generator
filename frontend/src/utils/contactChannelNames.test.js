import test from "node:test";
import assert from "node:assert/strict";
import { CHANNEL_NAMES, channelName } from "./contactChannelNames.js";

test("known channels map to Polish display names", () => {
  assert.equal(CHANNEL_NAMES.phone, "Telefon");
  assert.equal(channelName("email"), "E-mail");
});

test("channelName falls back to the raw key for unknown channels", () => {
  assert.equal(channelName("fax"), "fax");
});

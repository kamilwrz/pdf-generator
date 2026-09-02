import assert from "node:assert/strict";
import test from "node:test";

import { meridianTemplate } from "./meridian.js";

test("Meridian starter gives Education the Experience record structure", () => {
  const jobTitle = meridianTemplate.find(
    (element) => element.content === "Strategy & Operations Manager" && element.flowGroup,
  );
  const company = meridianTemplate.find(
    (element) => element.content === "Northbridge Advisory"
      && element.flowGroup === jobTitle?.flowGroup,
  );
  const degree = meridianTemplate.find(
    (element) => element.content === "Magister zarządzania",
  );
  const school = meridianTemplate.find(
    (element) => element.content === "Uniwersytet Ekonomiczny w Krakowie"
      && element.flowGroup === degree?.flowGroup,
  );
  const period = meridianTemplate.find(
    (element) => element.content === "2015 – 2017",
  );

  assert.ok(jobTitle);
  assert.ok(company);
  assert.ok(degree);
  assert.ok(school);
  assert.ok(period);

  // Both categories use the same title/organisation hierarchy; only their
  // semantic source fields differ when CV data is normalized and persisted.
  assert.equal(degree.bold, jobTitle.bold);
  assert.equal(degree.fontSize, jobTitle.fontSize);
  assert.equal(degree.lineHeight, jobTitle.lineHeight);
  assert.equal(degree.color, jobTitle.color);
  assert.equal(school.bold, company.bold);
  assert.equal(school.fontSize, company.fontSize);
  assert.equal(school.lineHeight, company.lineHeight);
  assert.equal(school.color, company.color);
  assert.ok(degree.top < school.top);

  assert.equal(period.flowRole, "record-overlay");
  assert.equal(period.autoHeight, false);
  assert.equal(period.align, "right");
  assert.equal(period.top, degree.top);
});

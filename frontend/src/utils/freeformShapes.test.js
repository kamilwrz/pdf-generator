import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  curvesToSvgPath,
  listPathControlHandles,
  movePathHandle,
  pathCurvesForKind,
  polygonPointsForShape,
  polygonToSvgPoints,
} from "./freeformShapes.js";

describe("freeformShapes", () => {
  it("returns triangle/diamond/hexagon presets", () => {
    assert.equal(polygonPointsForShape("triangle").length, 3);
    assert.equal(polygonPointsForShape("diamond").length, 4);
    assert.equal(polygonPointsForShape("hexagon").length, 6);
    assert.equal(polygonPointsForShape("unknown").length, 3);
  });

  it("builds SVG polygon points from the element box", () => {
    const points = polygonToSvgPoints([[0, 0], [1, 0.5], [0, 1]], 100, 50);
    assert.equal(points, "0,0 100,25 0,50");
  });

  it("builds cubic SVG path strings for wave preset", () => {
    const d = curvesToSvgPath(pathCurvesForKind("wave"), 100, 50);
    assert.match(d, /^M /);
    assert.match(d, / C /);
  });

  it("lists anchor and control handles for Bezier paths", () => {
    const handles = listPathControlHandles({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
      curves: pathCurvesForKind("arc"),
    });
    assert.ok(handles.some((handle) => handle.kind === "anchor"));
    assert.ok(handles.some((handle) => handle.kind === "control"));
  });

  it("moves a control handle in normalized box space", () => {
    const element = {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      curves: pathCurvesForKind("arc"),
    };
    const handle = listPathControlHandles(element).find((item) => item.role === "c1");
    const next = movePathHandle(element, handle, 50, 25);
    assert.equal(next[1].x1, 0.5);
    assert.equal(next[1].y1, 0.25);
  });
});

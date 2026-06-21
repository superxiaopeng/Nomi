import { describe, expect, it } from "vitest";
import { firstString, isJsonRecord, nowIso, readNestedRecord, trim } from "./jsonUtils";

describe("trim", () => {
  it("trims strings and returns '' for non-strings", () => {
    expect(trim("  hi  ")).toBe("hi");
    expect(trim("")).toBe("");
    expect(trim(123)).toBe("");
    expect(trim(null)).toBe("");
    expect(trim(undefined)).toBe("");
    expect(trim({})).toBe("");
  });
});

describe("firstString", () => {
  it("returns the first trim-nonempty string", () => {
    expect(firstString("", "  ", "x", "y")).toBe("x");
    expect(firstString(null, undefined, 0, "found")).toBe("found");
  });
  it("returns '' when nothing qualifies", () => {
    expect(firstString("", "   ", null, undefined, 42)).toBe("");
    expect(firstString()).toBe("");
  });
});

describe("isJsonRecord", () => {
  it("accepts plain objects only", () => {
    expect(isJsonRecord({})).toBe(true);
    expect(isJsonRecord({ a: 1 })).toBe(true);
  });
  it("rejects arrays, null, and primitives", () => {
    expect(isJsonRecord([])).toBe(false);
    expect(isJsonRecord(null)).toBe(false);
    expect(isJsonRecord("x")).toBe(false);
    expect(isJsonRecord(7)).toBe(false);
    expect(isJsonRecord(undefined)).toBe(false);
  });
});

describe("readNestedRecord", () => {
  const input = { data: { status: "ok", nested: { value: 42 } }, list: [{ a: 1 }] };
  it("walks a nested path", () => {
    expect(readNestedRecord(input, ["data", "status"])).toBe("ok");
    expect(readNestedRecord(input, ["data", "nested", "value"])).toBe(42);
  });
  it("returns undefined when a segment is missing or non-object", () => {
    expect(readNestedRecord(input, ["data", "missing"])).toBeUndefined();
    expect(readNestedRecord(input, ["data", "status", "deeper"])).toBeUndefined();
    expect(readNestedRecord(null, ["a"])).toBeUndefined();
  });
  it("returns the input itself for an empty path", () => {
    expect(readNestedRecord(input, [])).toBe(input);
  });
});

describe("nowIso", () => {
  it("returns an ISO-8601 timestamp string", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildValidatedGapAssignments,
  collectAffectedUnitIdsFromAssignments,
} from "./branch-gap-distribution.js";

test("buildValidatedGapAssignments marks answered skipped and pending correctly", () => {
  const gaps = [
    { gapId: "gap_001" },
    { gapId: "gap_002" },
    { gapId: "gap_003" },
  ];

  const assignments = {
    gap_001: {
      selectedUnitId: "internship-1",
      selectedSection: "internships",
      userAnswer: "补充了结果",
    },
    gap_002: {
      selectedUnitId: "",
      selectedSection: "none",
      userAnswer: "",
    },
    gap_003: {
      selectedUnitId: "",
      selectedSection: "",
      userAnswer: "",
    },
  };

  const result = buildValidatedGapAssignments(gaps, assignments);

  assert.equal(result.hasValidationError, false);
  assert.equal(result.assignments.gap_001.status, "answered");
  assert.equal(result.assignments.gap_002.status, "skipped");
  assert.equal(result.assignments.gap_003.status, "pending");
});

test("buildValidatedGapAssignments blocks selected experience without answer", () => {
  const gaps = [{ gapId: "gap_001" }];
  const assignments = {
    gap_001: {
      selectedUnitId: "project-1",
      selectedSection: "projects",
      userAnswer: "",
    },
  };

  const result = buildValidatedGapAssignments(gaps, assignments);

  assert.equal(result.hasValidationError, true);
  assert.equal(
    result.assignments.gap_001.error,
    "请选择经历后补充回答，或直接点击「不在任何经历里补」",
  );
});

test("collectAffectedUnitIdsFromAssignments only returns answered unique targets", () => {
  const assignments = {
    gap_001: {
      selectedUnitId: "internship-1",
      selectedSection: "internships",
      userAnswer: "结果一",
      status: "answered",
    },
    gap_002: {
      selectedUnitId: "internship-1",
      selectedSection: "internships",
      userAnswer: "结果二",
      status: "answered",
    },
    gap_003: {
      selectedUnitId: "",
      selectedSection: "none",
      userAnswer: "",
      status: "skipped",
    },
  };

  const result = collectAffectedUnitIdsFromAssignments(assignments);

  assert.deepEqual(result, ["internship-1"]);
});

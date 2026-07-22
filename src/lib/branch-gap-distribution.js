const EMPTY_ASSIGNMENT = {
  selectedUnitId: "",
  selectedSection: "",
  userAnswer: "",
  status: "",
  guideOpen: false,
  selectorOpen: false,
  error: "",
};

export function createEmptyGapAssignmentItem() {
  return { ...EMPTY_ASSIGNMENT };
}

export function buildValidatedGapAssignments(gaps, assignments) {
  const nextAssignments = { ...assignments };
  let hasValidationError = false;

  for (const gap of gaps) {
    const currentAssignment = {
      ...createEmptyGapAssignmentItem(),
      ...(nextAssignments[gap.gapId] ?? {}),
    };
    const answer = String(currentAssignment.userAnswer ?? "").trim();
    const hasSelectedConcreteUnit =
      currentAssignment.selectedSection !== "" && currentAssignment.selectedSection !== "none";
    const selectedNone = currentAssignment.selectedSection === "none";

    let status = "";
    let error = "";

    if (hasSelectedConcreteUnit && !answer) {
      error = "请选择经历后补充回答，或直接点击「不在任何经历里补」";
      hasValidationError = true;
    } else if (selectedNone) {
      status = "skipped";
    } else if (!hasSelectedConcreteUnit && !selectedNone && !answer) {
      status = "pending";
    } else if (!hasSelectedConcreteUnit && answer) {
      error = "请先选择这条差距要补到哪段经历";
      hasValidationError = true;
    } else if (hasSelectedConcreteUnit && answer) {
      status = "answered";
    }

    nextAssignments[gap.gapId] = {
      ...currentAssignment,
      status,
      error,
    };
  }

  return {
    assignments: nextAssignments,
    hasValidationError,
  };
}

export function collectAffectedUnitIdsFromAssignments(assignments) {
  return [...new Set(
    Object.values(assignments)
      .filter((assignment) => assignment?.status === "answered" && assignment?.selectedUnitId)
      .map((assignment) => assignment.selectedUnitId),
  )];
}

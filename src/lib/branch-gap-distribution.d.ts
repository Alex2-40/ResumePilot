export type GapAssignmentStatus = "answered" | "skipped" | "pending" | "";
export type GapAssignmentSection = "internships" | "projects" | "other_experiences" | "none" | "";

export type GapAssignmentItem = {
  selectedUnitId: string;
  selectedSection: GapAssignmentSection;
  userAnswer: string;
  status: GapAssignmentStatus;
  guideOpen: boolean;
  selectorOpen: boolean;
  error: string;
};

export function createEmptyGapAssignmentItem(): GapAssignmentItem;

export function buildValidatedGapAssignments(
  gaps: Array<{ gapId: string }>,
  assignments: Record<string, Partial<GapAssignmentItem>>,
): {
  assignments: Record<string, GapAssignmentItem>;
  hasValidationError: boolean;
};

export function collectAffectedUnitIdsFromAssignments(
  assignments: Record<string, Partial<GapAssignmentItem>>,
): string[];

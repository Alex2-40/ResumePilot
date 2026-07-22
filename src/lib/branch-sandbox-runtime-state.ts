export type SandboxStatus = "active" | "archived" | "completed";

export type GapType =
  | "missing_jd_keyword"
  | "missing_related_action"
  | "missing_business_result"
  | "missing_metric"
  | "missing_method_or_tool"
  | "generic_expression";

export type AnswerStatus = "positive" | "negative" | "skipped" | "unclear" | "";
export type GapItemStatus = "pending" | "answered" | "skipped" | "unclear" | "";

export type SandboxContext = {
  sandboxId: string;
  userId: string;
  resumeId: string;
  jobId: string;
  sessionId: string;
  targetSection: string;
  targetUnitId: string;
  schemaVersion: "v1";
  status: SandboxStatus;
};

export type GapContextItem = {
  gapId: string;
  gapType: GapType | "";
  gapTitle: string;
  mainQuestion: string;
  status: GapItemStatus;
  userAnswer: string;
  answerStatus: AnswerStatus;
  extractedPositiveFacts: string[];
  extractedNegativeFacts: string[];
  isCurrentGap: boolean;
};

export type GapAnalysisSourceItem = {
  gapId: string;
  gapType: GapType;
  gapTitle: string;
  mainQuestion: string;
  status: "pending";
};

export type OptimizeResult<TOptimizedDraft = unknown> = {
  optimizedDraft: TOptimizedDraft;
};

export type TimestampInfo = {
  createdAt: string;
  updatedAt: string;
};

export type TargetJob<TJobJd = unknown> = {
  title: string;
  jd: TJobJd;
};

export type SandboxRuntimeState<TDraft = unknown, TJobJd = unknown, TOptimizedDraft = unknown> = {
  sandboxContext: SandboxContext;
  currentDraft: TDraft;
  targetJob: TargetJob<TJobJd>;
  resumeRules: string[];
  latestUserInstruction: string;
  gapContext: GapContextItem[];
  optimizeResult: OptimizeResult<TOptimizedDraft>;
  timestamps: TimestampInfo;
};

export function createEmptyOptimizeResult<TOptimizedDraft = unknown>(
  optimizedDraft: TOptimizedDraft,
): OptimizeResult<TOptimizedDraft> {
  return {
    optimizedDraft,
  };
}

export function mapGapAnalysisItemToGapContextItem(
  source: GapAnalysisSourceItem,
  overrides?: Partial<GapContextItem>,
): GapContextItem {
  return {
    gapId: source.gapId,
    gapType: source.gapType,
    gapTitle: source.gapTitle,
    mainQuestion: source.mainQuestion,
    status: source.status,
    userAnswer: "",
    answerStatus: "",
    extractedPositiveFacts: [],
    extractedNegativeFacts: [],
    isCurrentGap: false,
    ...overrides,
  };
}

export function mapGapAnalysisItemsToGapContext(
  sources: GapAnalysisSourceItem[],
  currentGapIndex?: number,
): GapContextItem[] {
  return sources.map((source, index) =>
    mapGapAnalysisItemToGapContextItem(source, {
      isCurrentGap: currentGapIndex !== undefined ? index === currentGapIndex : false,
    }),
  );
}

export function appendGapContextItemsToSandboxState<
  TDraft = unknown,
  TJobJd = unknown,
  TOptimizedDraft = unknown,
>(
  sandboxState: SandboxRuntimeState<TDraft, TJobJd, TOptimizedDraft>,
  items: GapContextItem[],
  options?: {
    setFirstAsCurrent?: boolean;
  },
): SandboxRuntimeState<TDraft, TJobJd, TOptimizedDraft> {
  const existingGapContext = options?.setFirstAsCurrent
    ? sandboxState.gapContext.map((item) => ({
        ...item,
        isCurrentGap: false,
      }))
    : sandboxState.gapContext;

  const nextItems =
    options?.setFirstAsCurrent && items.length > 0
      ? items.map((item, index) => ({
          ...item,
          isCurrentGap: index === 0,
        }))
      : items;

  return {
    ...sandboxState,
    gapContext: [...existingGapContext, ...nextItems],
    timestamps: {
      ...sandboxState.timestamps,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function createEmptySandboxRuntimeState<
  TDraft = unknown,
  TJobJd = unknown,
  TOptimizedDraft = unknown,
>(params?: {
  sandboxContext?: Partial<SandboxContext>;
  currentDraft?: TDraft;
  targetJob?: Partial<TargetJob<TJobJd>>;
  resumeRules?: string[];
  latestUserInstruction?: string;
  gapContext?: GapContextItem[];
  optimizeResult?: Partial<OptimizeResult<TOptimizedDraft>>;
  timestamps?: Partial<TimestampInfo>;
}): SandboxRuntimeState<TDraft, TJobJd, TOptimizedDraft> {
  const now = new Date().toISOString();

  return {
    sandboxContext: {
      sandboxId: params?.sandboxContext?.sandboxId ?? "",
      userId: params?.sandboxContext?.userId ?? "",
      resumeId: params?.sandboxContext?.resumeId ?? "",
      jobId: params?.sandboxContext?.jobId ?? "",
      sessionId: params?.sandboxContext?.sessionId ?? "",
      targetSection: params?.sandboxContext?.targetSection ?? "",
      targetUnitId: params?.sandboxContext?.targetUnitId ?? "",
      schemaVersion: "v1",
      status: params?.sandboxContext?.status ?? "active",
    },
    currentDraft: (params?.currentDraft ?? ({} as TDraft)) as TDraft,
    targetJob: {
      title: params?.targetJob?.title ?? "",
      jd: (params?.targetJob?.jd ?? ({} as TJobJd)) as TJobJd,
    },
    resumeRules: params?.resumeRules ?? [],
    latestUserInstruction: params?.latestUserInstruction ?? "",
    gapContext: params?.gapContext ?? [],
    optimizeResult: {
      ...createEmptyOptimizeResult<TOptimizedDraft>({} as TOptimizedDraft),
      ...params?.optimizeResult,
    },
    timestamps: {
      createdAt: params?.timestamps?.createdAt ?? now,
      updatedAt: params?.timestamps?.updatedAt ?? now,
    },
  };
}

export const EMPTY_SANDBOX_RUNTIME_STATE_JSON_TEMPLATE = {
  sandboxContext: {
    sandboxId: "",
    userId: "",
    resumeId: "",
    jobId: "",
    sessionId: "",
    targetSection: "",
    targetUnitId: "",
    schemaVersion: "v1",
    status: "active",
  },
  currentDraft: {},
  targetJob: {
    title: "",
    jd: {},
  },
  resumeRules: [],
  latestUserInstruction: "",
  gapContext: [
    {
      gapId: "gap_001",
      gapType: "",
      gapTitle: "",
      mainQuestion: "",
      status: "pending",
      userAnswer: "",
      answerStatus: "",
      extractedPositiveFacts: [],
      extractedNegativeFacts: [],
      isCurrentGap: false,
    },
  ],
  optimizeResult: {
    optimizedDraft: {},
  },
  timestamps: {
    createdAt: "",
    updatedAt: "",
  },
} as const;

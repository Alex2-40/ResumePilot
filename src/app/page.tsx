"use client";

import { CSSProperties, ChangeEvent, DragEvent, KeyboardEvent, ReactNode, TouchEvent, WheelEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { createPortal } from "react-dom";
import { AuroraGlowCard } from "@/components/ui/aurora-glow-card";
import {
  createEmptySandboxRuntimeState,
  type GapContextItem,
  type SandboxRuntimeState,
} from "@/lib/branch-sandbox-runtime-state";
import {
  buildValidatedGapAssignments,
  collectAffectedUnitIdsFromAssignments,
  createEmptyGapAssignmentItem,
} from "@/lib/branch-gap-distribution.js";
import { measureResumeBlocks, type LayoutBlockKind, type MeasuredBlock } from "@/lib/resume-measure";
import { estimateSplitItemHeight, paginateResume, type ResumePage } from "@/lib/resume-pagination";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type ViewMode = "user" | "debug";
type ResumeParseResponse = { resumeJson: unknown } | { error: string };
type ResumePdfExtractResponse = { resumeText: string } | { error: string };
type JdParseResponse = { jdJson: unknown } | { error: string };
type JdImageExtractResponse = { jdJson: unknown } | { error: string };
type GenerateResponse = { result: string } | { error: string };
type DraftJsonResponse = { draftResumeJson: unknown } | { error: string };
type OptimizeResponse = { result: string } | { error: string };
type BossGreetingResponse = { result: string } | { error: string };
type CoverLetterResponse = { result: string } | { error: string };
type GlobalGapType =
  | "missing_jd_keyword"
  | "missing_related_action"
  | "missing_business_result"
  | "missing_metric"
  | "missing_method_or_tool"
  | "generic_expression";
type GlobalGapItem = {
  gapId: string;
  gapType: GlobalGapType;
  gapTitle: string;
  severity: number;
  whyThisGap: string;
  gapDescription: string;
  mainQuestion: string;
  howToAnswer: string[];
  status: "pending";
};
type GlobalGapAnalysisResponse =
  | {
      versionId: string;
      overallAssessment: string;
      gaps: GlobalGapItem[];
    }
  | { error: string };
type GlobalGapAnalysisSuccess = Extract<GlobalGapAnalysisResponse, { gaps: GlobalGapItem[] }>;
type BranchMemoryWriterResponse =
  | {
      userAnswer: string;
      answerStatus: "positive" | "negative" | "skipped" | "unclear";
      extractedPositiveFacts: string[];
      extractedNegativeFacts: string[];
      status: "answered" | "skipped" | "unclear";
    }
  | { error: string };
type SectionKey =
  | "basic_info"
  | "education"
  | "internships"
  | "projects"
  | "other_experiences"
  | "skills"
  | "personal_advantages";
type PreviewFontSize = "small" | "standard" | "large";
type PreviewDensity = "compact" | "standard" | "relaxed";
type PreviewMargin = "narrow" | "standard" | "wide";
type PreviewFontFamily = "kaiti" | "sans" | "serif";
type PreviewFontWeight = "light" | "standard" | "bold";
type PreviewSettings = {
  fontSize: PreviewFontSize;
  density: PreviewDensity;
  margin: PreviewMargin;
  fontFamily: PreviewFontFamily;
  fontWeight: PreviewFontWeight;
  verticalMarginMm: number;
  unitGapPx: number;
  sectionGapPx: number;
};
type HiddenGenerationStatus = "idle" | "running" | "success" | "error";
type GeneratedAssetStatus = "idle" | "running" | "success" | "error";
type WorkflowInternshipDuration = "" | "可实习2月+" | "可实习3月+" | "可实习6月+";
type WorkflowTemplateCategory = "cover-letter" | "boss-greeting";
type GeneratedResultPreviewKind = "cover-letter" | "boss-greeting";
type UserFacingTemplate = {
  template: string;
  example: string;
};
type WorkflowTemplateConfig = {
  id: string;
  category: WorkflowTemplateCategory;
  title: string;
  subtitle: string;
  description: string;
  userFacing: UserFacingTemplate;
  systemPrompt?: string;
};
type GeneratedAssetState = {
  status: GeneratedAssetStatus;
  content: string;
  error: string;
  requestKey: string;
};
const BOSS_GREETING_STORAGE_KEY = "ai-resume-generator:boss-greeting-asset";
const COVER_LETTER_STORAGE_KEY = "ai-resume-generator:cover-letter-asset";
type ChatMessage = {
  id: string;
  role: "ai" | "user";
  unitId: string;
  text: string;
  type: "section" | "modify-placeholder" | "user-input" | "optimize-result" | "round-divider";
  versionItem?: BranchEditableTarget;
};
type BranchEditMode = "user-driven" | "assistant-guided";
type BranchMemory = {
  mode: BranchEditMode | null;
  lastOptimizedVersion: BranchEditableTarget | null;
};
type BranchPlanningPhase =
  | "initial-analyzing"
  | "direct-editing"
  | "generating";
type BranchPlanningState = {
  visible: boolean;
  phase: BranchPlanningPhase;
  title: string;
  subtext?: string;
  decision?: string;
  nextStep?: string;
  showPreview?: boolean;
  lockInput?: boolean;
};
type BranchSandboxState = SandboxRuntimeState<BranchEditableTarget, unknown, BranchEditableTarget>;
type BranchGapAssignmentStatus = "answered" | "skipped" | "pending" | "";
type BranchGapAssignmentSection = "internships" | "projects" | "other_experiences" | "none" | "";
type BranchGapAssignmentItemState = {
  selectedUnitId: string;
  selectedSection: BranchGapAssignmentSection;
  userAnswer: string;
  status: BranchGapAssignmentStatus;
  guideOpen: boolean;
  selectorOpen: boolean;
  error: string;
};
type BranchGapFormState = {
  assignments: Record<string, BranchGapAssignmentItemState>;
  submitting: boolean;
  completed: boolean;
};
type DebugMemoryWriterResultItem = {
  gapId: string;
  gapTitle: string;
  selectedUnitId: string;
  selectedSection: BranchGapAssignmentSection;
  result: Extract<BranchMemoryWriterResponse, { userAnswer: string }>;
};
type DebugOptimizeResultItem = {
  unitId: string;
  unitLabel: string;
  result: BranchEditableTarget;
};

type DraftJsonValueItem = {
  label: string;
  value: string;
};

type DraftJsonEducationItem = {
  id: string;
  school: string;
  major: string;
  degree: string;
  start_date: string;
  end_date: string;
  gpa: string;
  ranking: string;
  courses: string[];
  honors: string[];
};
type DraftJsonBullet = {
  id: string;
  label: string;
  content: string;
};
type DraftJsonInternshipItem = {
  id: string;
  company: string;
  role: string;
  start_date: string;
  end_date: string;
  bullets: DraftJsonBullet[];
};
type DraftJsonProjectItem = {
  id: string;
  name: string;
  role: string;
  start_date: string;
  end_date: string;
  bullets: DraftJsonBullet[];
};
type DraftJsonOtherExperienceItem = {
  id: string;
  type: string;
  name: string;
  role: string;
  start_date: string;
  end_date: string;
  bullets: DraftJsonBullet[];
};
type DraftJsonSkillItem = {
  id?: string;
  label: string;
  content: string;
};
type DraftJsonPersonalAdvantageItem = {
  id: string;
  content: string;
};
type DraftJson = {
  basic_info: {
    status: string;
    items: DraftJsonValueItem[];
  };
  education: {
    status: string;
    items: DraftJsonEducationItem[];
  };
  internships: {
    status: string;
    items: DraftJsonInternshipItem[];
  };
  projects: {
    status: string;
    items: DraftJsonProjectItem[];
  };
  other_experiences: {
    status: string;
    items: DraftJsonOtherExperienceItem[];
  };
  skills: {
    status: string;
    items: DraftJsonSkillItem[];
  };
  personal_advantages: {
    status: string;
    items: DraftJsonPersonalAdvantageItem[];
  };
};

type BasicInfoForm = {
  name: string;
  phone: string;
  email: string;
  targetRole: string;
  portfolio: string;
  github: string;
  politicalStatus: string;
};

type EducationFormItem = {
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  gpa: string;
  ranking: string;
  courses: string[];
  honors: string[];
};

type ExperienceFormItem = {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  bullets: string;
};

type ProjectFormItem = {
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  bullets: string;
};

type OtherExperienceType = "校园" | "创业" | "自媒体" | "科研" | "比赛";

type OtherExperienceFormItem = {
  type: OtherExperienceType;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  bullets: string;
};

type SkillsForm = {
  officeTools: string[];
  dataTools: string[];
  designTools: string[];
  contentTools: string[];
  aiTools: string[];
  languageSkills: string[];
  certifications: string[];
};

type ResumeFormState = {
  basicInfo: BasicInfoForm;
  education: EducationFormItem[];
  internships: ExperienceFormItem[];
  projects: ProjectFormItem[];
  otherExperiences: OtherExperienceFormItem[];
  skills: SkillsForm;
  selfSummary: string;
};

type ParsedResumeJson = {
  basic_info?: {
    phone?: string;
    email?: string;
    name?: string;
    target_role?: string;
    portfolio?: string;
    github?: string;
    political_status?: string;
  };
  education?: Array<{
    school?: string;
    degree?: string;
    major?: string;
    start_date?: string;
    end_date?: string;
    gpa?: string;
    ranking?: string;
    courses?: string[];
    honors?: string[];
  }>;
  internships?: Array<{
    company?: string;
    role?: string;
    start_date?: string;
    end_date?: string;
    bullets?: string[];
  }>;
  projects?: Array<{
    name?: string;
    role?: string;
    start_date?: string;
    end_date?: string;
    bullets?: string[];
  }>;
  other_experiences?: Array<{
    type?: OtherExperienceType;
    name?: string;
    role?: string;
    start_date?: string;
    end_date?: string;
    bullets?: string[];
  }>;
  skills?: {
    office_tools?: string[];
    data_tools?: string[];
    design_tools?: string[];
    content_tools?: string[];
    ai_tools?: string[];
    language_skills?: string[];
    certifications?: string[];
  };
  self_summary?: string;
};

type CollapsibleSectionKey = "internships" | "projects" | "otherExperiences" | "skills" | "selfSummary";
type SkillCategoryKey = keyof SkillsForm;
type UnitRetentionState = "kept" | "removed";

type ConfirmationUnit =
  | {
      id: "basic_info";
      sectionKey: "basic_info";
      label: string;
      itemIndex: null;
    }
  | {
      id: "education";
      sectionKey: "education";
      label: string;
      itemIndex: null;
    }
  | {
      id: string;
      sectionKey: "internships";
      label: string;
      itemIndex: number;
    }
  | {
      id: string;
      sectionKey: "projects";
      label: string;
      itemIndex: number;
    }
  | {
      id: string;
      sectionKey: "other_experiences";
      label: string;
      itemIndex: number;
    }
  | {
      id: string;
      sectionKey: "skills";
      label: string;
      itemIndex: null;
    }
  | {
      id: string;
      sectionKey: "personal_advantages";
      label: string;
      itemIndex: null;
    };

type OptimizableSectionKey = "internships" | "projects" | "other_experiences";
type QuickActionSectionKey = "basic_info" | "education" | "skills" | "personal_advantages";
type OptimizableDraftItem =
  | DraftJsonInternshipItem
  | DraftJsonProjectItem
  | DraftJsonOtherExperienceItem;
type BranchEditableTarget =
  | DraftJson["basic_info"]
  | DraftJson["education"]
  | OptimizableDraftItem
  | DraftJson["skills"]
  | DraftJson["personal_advantages"];
type QuickAction = {
  label: string;
  prompt: string;
};
type PreviewRenderStyles = {
  basicInfoStack: string;
  educationStack: string;
  itemStack: string;
  nameText: string;
  titleText: string;
  metaText: string;
  bodyText: string;
  bodyGroup: string;
  list: string;
  honorList: string;
  labelText: string;
};

type AcceptedPreviewSection = {
  sectionKey: SectionKey;
  title: string;
  units: ConfirmationUnit[];
};

type PreviewLayoutBlockDescriptor = {
  id: string;
  unitId: string;
  sectionKey: SectionKey;
  kind: LayoutBlockKind;
  keepTogether: boolean;
  content: ReactNode;
};

type PreviewSliderKey = "verticalMarginMm" | "unitGapPx" | "sectionGapPx";

const SECTION_ORDER: SectionKey[] = [
  "basic_info",
  "education",
  "internships",
  "projects",
  "other_experiences",
  "skills",
  "personal_advantages",
];

const SECTION_LABELS: Record<SectionKey, string> = {
  basic_info: "基本信息",
  education: "教育背景",
  internships: "实习经历",
  projects: "项目经历",
  other_experiences: "其他经历",
  skills: "技能工具",
  personal_advantages: "个人优势",
};

const PREVIEW_DEFAULT_SETTINGS: PreviewSettings = {
  fontSize: "standard",
  density: "compact",
  margin: "narrow",
  fontFamily: "kaiti",
  fontWeight: "light",
  verticalMarginMm: 8,
  unitGapPx: 4,
  sectionGapPx: 8,
};

const PREVIEW_FONT_SIZE_CONFIG: Record<PreviewFontSize, { bodyPt: number; metaPt: number; headingPt: number; sectionPt: number }> = {
  small: { bodyPt: 10, metaPt: 9, headingPt: 10.5, sectionPt: 12.5 },
  standard: { bodyPt: 11, metaPt: 10, headingPt: 11, sectionPt: 14 },
  large: { bodyPt: 12, metaPt: 11, headingPt: 12, sectionPt: 15.5 },
};

const PREVIEW_FONT_SIZE_CLASS: Record<PreviewFontSize, { body: string; meta: string; heading: string; section: string; name: string }> = {
  small: { body: "text-[10pt]", meta: "text-[9pt]", heading: "text-[10.5pt]", section: "text-[12.5pt]", name: "text-[20pt]" },
  standard: { body: "text-[11pt]", meta: "text-[10pt]", heading: "text-[11pt]", section: "text-[14pt]", name: "text-[22pt]" },
  large: { body: "text-[12pt]", meta: "text-[11pt]", heading: "text-[12pt]", section: "text-[15.5pt]", name: "text-[22pt]" },
};

const PREVIEW_DENSITY_CONFIG: Record<PreviewDensity, { sectionGap: string; unitGap: string; headerContentGap: string; itemGap: string; listGap: string; headerPadding: string; lineHeight: number; pageCapacity: number; overflowAllowance: number }> = {
  compact: { sectionGap: "space-y-3", unitGap: "space-y-3", headerContentGap: "space-y-0.5", itemGap: "space-y-2", listGap: "space-y-1", headerPadding: "pb-0", lineHeight: 1.45, pageCapacity: 118, overflowAllowance: 18 },
  standard: { sectionGap: "space-y-4", unitGap: "space-y-4", headerContentGap: "space-y-1", itemGap: "space-y-2.5", listGap: "space-y-1.5", headerPadding: "pb-0.5", lineHeight: 1.55, pageCapacity: 102, overflowAllowance: 12 },
  relaxed: { sectionGap: "space-y-5", unitGap: "space-y-5", headerContentGap: "space-y-1.5", itemGap: "space-y-3", listGap: "space-y-2", headerPadding: "pb-1", lineHeight: 1.65, pageCapacity: 90, overflowAllowance: 8 },
};

const PREVIEW_MARGIN_CONFIG: Record<PreviewMargin, { horizontalMm: number; verticalMm: number; pageCapacityOffset: number }> = {
  narrow: { horizontalMm: 12.7, verticalMm: 5, pageCapacityOffset: 10 },
  standard: { horizontalMm: 16, verticalMm: 10, pageCapacityOffset: 0 },
  wide: { horizontalMm: 20, verticalMm: 14, pageCapacityOffset: -10 },
};

const PREVIEW_PAGE_GAP_PX = 24;
const PREVIEW_A4_WIDTH_PX = (210 / 25.4) * 96;
const PREVIEW_A4_HEIGHT_PX = (297 / 25.4) * 96;
const PREVIEW_MIN_DISPLAY_SCALE = 0.35;
const PREVIEW_DISPLAY_HORIZONTAL_PADDING_PX = 32;
const PREVIEW_VERTICAL_MARGIN_RANGE = { min: 8, max: 14, step: 1 };
const PREVIEW_UNIT_GAP_RANGE = { min: 4, max: 15, step: 1 };
const PREVIEW_SECTION_GAP_RANGE = { min: 6, max: 20, step: 1 };
const PREVIEW_FIXED_HEADER_CONTENT_GAP_PX = 4;
const PREVIEW_FIXED_BASIC_EDUCATION_GAP_PX = 8;
const PREVIEW_FIXED_EDUCATION_UNIT_GAP_PX = 6;

const PREVIEW_FONT_FAMILY_CLASS: Record<PreviewFontFamily, string> = {
  kaiti: "font-['Kaiti_TC','KaiTi','STKaiti',serif]",
  serif: "font-['STSong','Songti_SC','SimSun',serif]",
  sans: "font-sans",
};

const PREVIEW_WEIGHT_CONFIG: Record<PreviewFontWeight, { body: string; title: string; section: string }> = {
  light: { body: "font-medium", title: "font-bold", section: "font-bold" },
  standard: { body: "font-normal", title: "font-semibold", section: "font-semibold" },
  bold: { body: "font-semibold", title: "font-extrabold", section: "font-extrabold" },
};

const COVER_LETTER_TYPE_1_SYSTEM_PROMPT = `请你基于我提供的 JD JSON、Draft JSON 以及第二页表单信息，严格生成一封中文求职信（Cover Letter）。
不要输出任何解释、分析过程、标题说明或额外提示，只输出最终信件正文。

# 上下文说明
你会同时收到以下三份材料作为生成依据：
1. JD JSON：用于提炼岗位核心要求、能力关键词、业务重点
2. Draft JSON：用于提供候选人的真实经历、教育背景、项目、成果与可引用事实
3. 第二页表单信息：
- 投递岗位名称
- 可实习时长
- 投递公司名称

# 使用原则
- JD JSON 决定岗位需要什么
- Draft JSON 决定候选人真实具备什么
- 第二页表单信息决定本次投递场景中的岗位名称、实习时长和公司名称
- 输出内容必须同时参考这三类信息
- 不允许只根据 JD JSON 空泛生成
- 不允许脱离 Draft JSON 编造经历、成果、教育背景或能力证明
- 岗位名称与实习时长必须以第二页表单信息为准，不允许自行改写或替换

# 输出结构
【有相关经验】姓名—电话—投递岗位—立即到岗实习X个月+

尊敬的招聘负责人：

您好，我叫XXX，毕业于XXX学校XXX专业。我在小红书上看到了贵司XX岗位的实习招聘信息，对这个岗位非常向往，也非常希望能有机会参与贵司的实际业务。

我认为自己与该岗位有较高匹配度，主要体现在以下几点：
- XXXX：结合「经历名称」，说明与岗位匹配的能力与成果。
- XXXX：结合「经历名称」，说明与岗位匹配的能力与成果。
- XXXX：结合「经历名称」，说明与岗位匹配的能力与成果。

此外，我过往已经积累了多段与该岗位高度相关的实习 / 项目 / 实践经历，也拥有较强的业务理解、执行能力与结果导向意识，能够较快适应岗位要求并投入实际工作。

我一直很向往能够加入贵司这样的团队，参与XX方向的实际业务，在真实项目中不断学习、积累经验并提升自己。如果有机会加入，我也希望能在持续成长的同时，为团队贡献实际价值。

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！

# 生成规则
1. 标题中的姓名和电话必须从 Draft JSON 中提取
2. 标题中的投递岗位必须使用第二页表单中的投递岗位名称
3. 如果投递岗位名称中包含“实习生”，输出时删除这三个字，只保留岗位核心名称
4. 标题中的立即到岗实习X个月+必须严格使用第二页表单中的可实习时长原始文本，保持原样输出
5. 第一段中的姓名、学校、专业必须从 Draft JSON 中提取
6. 如果 Draft JSON 中存在多段教育经历，优先选择主教育经历或最能代表当前候选人身份的一段学校与专业信息
7. 第一段中岗位来源平台固定写为小红书，不得替换为其他平台
8. 第二段的 3 个 bullet point 必须全部基于 Draft JSON 的真实内容，不允许空泛概括
9. 第二段的每个 bullet point 都要尽量回应 JD JSON 中的核心要求、关键词、hard skill 或岗位重点
10. 当文案中提到某一段实习、项目、校园经历或实践经历时，必须明确写出该段经历名称，并使用「」标注
11. 不允许只写“某段经历”“某个项目”“相关实践”这类模糊表达
12. 如果一句话里同时涉及公司名和项目名，优先选择最能代表该经历的一项，并使用「」标出
13. 第三段应体现高度匹配型候选人的特点，即：已有较多相关经历、能较快上手、具备明确的岗位适配度
14. 第四段应表达对公司和业务方向的向往，但不得编造公司事实、项目背景、业务数据或发展成绩
15. 如果 JD JSON 中缺少足够公司信息，可以围绕岗位方向、业务场景和项目机会表达向往
16. 结尾必须严格按以下两行输出：

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！

# 风格要求
1. 正式、自然、真诚
2. 岗位匹配感强
3. 业务感强
4. 信息密度高
5. 不夸张、不油腻、不空泛
6. 语言要像正式投递材料，而不是聊天消息

# 长度要求
全文控制在 350-500 字`.trim();

const COVER_LETTER_TYPE_2_SYSTEM_PROMPT = `请你基于我提供的 JD JSON、Draft JSON 以及第二页表单信息，严格生成一封中文求职信（Cover Letter）。
不要输出任何解释、分析过程、标题说明或额外提示，只输出最终信件正文。

# 上下文说明
你会同时收到以下三份材料作为生成依据：
1. JD JSON：用于提炼岗位核心要求、hard skill、能力关键词、业务重点
2. Draft JSON：用于提供候选人的真实经历、教育背景、项目、成果与可引用事实
3. 第二页表单信息：
- 投递岗位名称
- 可实习时长
- 投递公司名称

# 使用原则
- JD JSON 决定岗位需要什么
- Draft JSON 决定候选人真实具备什么
- 第二页表单信息决定本次投递场景中的岗位名称、实习时长和公司名称
- 输出内容必须同时参考这三类信息
- 不允许只根据 JD JSON 空泛生成
- 不允许脱离 Draft JSON 编造经历、成果、教育背景或能力证明
- 岗位名称与实习时长必须以第二页表单信息为准，不允许自行改写或替换

# 输出结构
姓名—电话—投递岗位—立即到岗实习X个月+

尊敬的招聘负责人：

您好，我叫XXX，毕业于XXX学校XXX专业。我在小红书上看到了贵司XX岗位的实习招聘信息，对这个岗位非常向往，也非常希望能有机会参与贵司的实际业务。

虽然我暂时没有直接的XX岗位经验，但为了更好地匹配该岗位，我在1个月内自主学习了「岗位核心技能 / 工具 / 方法」，同时也在过往经历中积累了一些可迁移能力，主要体现在以下几点：
XXXX：结合「经历名称」，说明自己主动学习了哪些岗位核心技能，并如何结合课程 / 项目 / 实践完成相关任务。
XXXX：结合「经历名称」，说明自己具备哪些可迁移能力，例如跨团队沟通、信息整理、执行推进或问题拆解。
XXXX：结合「经历名称」，说明自己如何在真实项目 / 校园 / 实践中支持基础分析、执行落地或协作推进。

我持续关注XX方向，理解这个岗位不仅需要「理解1」，也需要「理解2」。对我来说，这个岗位不仅是一个执行入口，也是深入理解业务、积累行业认知和提升综合能力的重要机会。我也希望能在真实项目中持续学习，把已有的学习能力和实践能力逐步沉淀成更稳定的岗位能力。

我一直很向往能够加入贵司这样的团队，参与XX方向的实际业务，在真实项目中不断学习、积累经验并提升自己。如果有机会加入，我也希望能在持续成长的同时，为团队贡献实际价值。

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！

# 生成规则
1. 标题中的姓名和电话必须从 Draft JSON 中提取
2. 标题中的投递岗位必须使用第二页表单中的投递岗位名称
3. 如果投递岗位名称中包含“实习生”，输出时删除这三个字，只保留岗位核心名称
4. 标题中的立即到岗实习X个月+必须严格使用第二页表单中的可实习时长原始文本，保持原样输出
5. 第一段中的姓名、学校、专业必须从 Draft JSON 中提取
6. 如果 Draft JSON 中存在多段教育经历，优先选择主教育经历或最能代表当前候选人身份的一段学校与专业信息
7. 第一段中岗位来源平台固定写为小红书，不得替换为其他平台
8. 第二段开头必须明确表达“虽然暂时没有直接的XX岗位经验”，其中 XX 必须使用第二页表单中的投递岗位名称，并删除“实习生”三个字
9. 第二段中岗位核心技能 / 工具 / 方法必须直接来自 JD JSON
10. 第二段中关于主动学习的内容，必须体现“在1个月内自主学习了岗位核心技能”这一点
11. 第二段中关于可迁移能力的内容，必须优先选择 JD JSON 中要求的能力点，并使用 Draft JSON 中可以形成对应支撑的真实经历来展开
12. 第二段的 3 条内容都必须基于 Draft JSON 的真实经历、项目、校园经历或实践内容，不允许空泛概括
13. 当文案中提到某一段实习、项目、校园经历或实践经历时，必须明确写出该段经历名称，并使用「」标注
14. 不允许只写“某段经历”“某个项目”“相关实践”这类模糊表达
15. 如果一句话里同时涉及公司名和项目名，优先选择最能代表该经历的一项，并使用「」标出
16. 第三段中的 XX方向 必须直接使用第二页表单中的投递岗位名称，并删除“实习生”三个字
17. 第三段中的岗位理解可以结合 JD JSON 和模型对岗位的合理理解来写，但应尽可能带入 JD JSON 中的岗位关键词、职责重点或业务要求
18. 第三段中的 理解1、理解2 应尽量体现该岗位除了基础执行之外，还需要关注的 2 个维度
19. 第四段应表达对公司和业务方向的向往，但不得编造公司事实、项目背景、业务数据或发展成绩
20. 如果 JD JSON 中缺少足够公司信息，可以围绕岗位方向、业务场景和项目机会表达向往
21. 结尾必须严格按以下两行输出：

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！

# 风格要求
1. 正式、自然、真诚
2. 学习能力和成长潜力明确
3. 业务感清楚
4. 信息密度高
5. 不夸张、不油腻、不空泛
6. 语言要像正式投递材料，而不是聊天消息

# 长度要求
全文控制在 350-500 字`.trim();

const COVER_LETTER_TYPE_3_SYSTEM_PROMPT = `请你基于我提供的 JD JSON、Draft JSON 以及第二页表单信息，严格生成一封中文求职信（Cover Letter）。
不要输出任何解释、分析过程、标题说明或额外提示，只输出最终信件正文。

# 上下文说明
你会同时收到以下三份材料作为生成依据：
1. JD JSON：用于提炼岗位核心要求、hard skill、能力关键词、业务重点
2. Draft JSON：用于提供候选人的真实经历、教育背景、项目、成果与可引用事实
3. 第二页表单信息：
- 投递岗位名称
- 可实习时长
- 投递公司名称

# 使用原则
- JD JSON 决定岗位需要什么
- Draft JSON 决定候选人真实具备什么
- 第二页表单信息决定本次投递场景中的岗位名称、实习时长和公司名称
- 输出内容必须同时参考这三类信息
- 不允许只根据 JD JSON 空泛生成
- 不允许脱离 Draft JSON 编造经历、成果、教育背景或能力证明
- 岗位名称与实习时长必须以第二页表单信息为准，不允许自行改写或替换

# 输出结构
【有相关经验】姓名—电话—投递岗位—立即到岗实习X个月+

尊敬的招聘负责人：

您好，我叫XXX，毕业于XXX学校XXX专业。我在小红书上看到了贵司XX岗位的实习招聘信息，对这个岗位非常向往，也非常希望能有机会参与贵司的实际业务。

我已经具备一定的XX岗位相关基础，为了更好地匹配该岗位，我也在过往经历中积累了与岗位相关的能力，主要体现在以下几点：

XXXX：结合「经历名称」，说明自己接触并完成过哪些与岗位相关的工作内容。
XXXX：结合「经历名称」，说明自己积累了哪些与岗位相关的技能、方法或执行能力。
XXXX：结合「经历名称」，说明自己如何支持基础分析、执行落地、协作推进或结果输出。

我持续关注XX方向，理解这个岗位不仅「理解1」，也「理解2」。对我来说，这个岗位是把已有相关经验进一步沉淀为稳定岗位能力的重要机会，我也希望能在真实项目中不断提升自己的业务理解和执行能力。

我一直很向往能够加入贵司这样的团队，参与XX方向的实际业务，在真实项目中不断学习、积累经验并提升自己。如果有机会加入，我也希望能在持续成长的同时，为团队贡献实际价值。

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！

# 生成规则
1. 标题中的 姓名 和 电话 必须从 Draft JSON 中提取
2. 标题中的 投递岗位 必须使用第二页表单中的 投递岗位名称
3. 如果 投递岗位名称 中包含“实习生”，输出时删除这三个字，只保留岗位核心名称
4. 标题中的 立即到岗实习X个月+ 必须严格使用第二页表单中的 可实习时长 原始文本，保持原样输出
5. 第一段中的 姓名、学校、专业 必须从 Draft JSON 中提取
6. 如果 Draft JSON 中存在多段教育经历，优先选择主教育经历或最能代表当前候选人身份的一段学校与专业信息
7. 第一段中岗位来源平台固定写为 小红书，不得替换为其他平台
8. 第二段开头必须明确表达“已经具备一定的XX岗位相关基础”，其中 XX 必须使用第二页表单中的 投递岗位名称，并删除“实习生”三个字
9. 第二段的 3 条内容必须全部基于 Draft JSON 的真实经历、项目、校园经历或实践内容，不允许空泛概括
10. 第二段每一条都应尽量回应 JD JSON 中的核心要求、关键词、hard skill 或岗位重点
11. 第二段第一条优先写“接触并完成过的相关工作内容”
12. 第二段第二条优先写“已积累的相关技能、方法或执行能力”
13. 第二段第三条优先写“如何支持基础分析、执行落地、协作推进或结果输出”
14. 当文案中提到某一段实习、项目、校园经历或实践经历时，必须明确写出该段经历名称，并使用「」标注
15. 不允许只写“某段经历”“某个项目”“相关实践”这类模糊表达
16. 如果一句话里同时涉及公司名和项目名，优先选择最能代表该经历的一项，并使用「」标出
17. 第三段中的 XX方向 必须直接使用第二页表单中的 投递岗位名称，并删除“实习生”三个字
18. 第三段中的岗位理解可以结合 JD JSON 和模型对岗位的合理理解来写，但应尽可能带入 JD JSON 中的岗位关键词、职责重点或业务要求
19. 第三段中的 理解1、理解2 应尽量体现该岗位除了基础执行之外，还需要关注的 2 个维度
20. 第四段应表达对公司和业务方向的向往，但不得编造公司事实、项目背景、业务数据或发展成绩
21. 如果 JD JSON 中缺少足够公司信息，可以围绕岗位方向、业务场景和项目机会表达向往
22. 结尾必须严格按以下两行输出：

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！

# 风格要求
1. 正式、自然、真诚
2. 基础匹配感明确
3. 业务感清楚
4. 信息密度高
5. 不夸张、不油腻、不空泛
6. 语言要像正式投递材料，而不是聊天消息

# 长度要求
全文控制在 350-500 字`.trim();

const COVER_LETTER_TEMPLATE_PLACEHOLDERS: WorkflowTemplateConfig[] = [
  {
    id: "cover-letter-classic",
    category: "cover-letter",
    title: "高度匹配型",
    subtitle: "适用于有多段垂直相关经历的候选人",
    description: "强调岗位匹配、真实案例支撑和对公司业务的向往适合有多段垂直经历的投递场景。",
    userFacing: {
      template: `【有相关经验】姓名—电话—投递岗位—立即到岗实习X个月+

尊敬的招聘负责人：

您好，我叫XXX，毕业于XXX学校XXX专业。我在小红书上看到了贵司XX岗位的实习招聘信息，对这个岗位非常向往，也非常希望能有机会参与贵司的实际业务。

我认为自己与该岗位有较高匹配度，主要体现在以下几点：
- XXXX：结合「经历名称」，说明与岗位匹配的能力与成果。
- XXXX：结合「经历名称」，说明与岗位匹配的能力与成果。
- XXXX：结合「经历名称」，说明与岗位匹配的能力与成果。

此外，我过往已经积累了多段与该岗位高度相关的实习 / 项目 / 实践经历，也拥有较强的业务理解、执行能力与结果导向意识，能够较快适应岗位要求并投入实际工作。

我一直很向往能够加入贵司这样的团队，参与XX方向的实际业务，在真实项目中不断学习、积累经验并提升自己。如果有机会加入，我也希望能在持续成长的同时，为团队贡献实际价值。

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！`,
      example: `【有相关经验】张同学—138XXXX5678—海外GTM—立即到岗实习6月+

尊敬的招聘负责人：

您好，我叫张同学，毕业于XX大学信息管理与信息系统专业。我在小红书上看到了贵司海外GTM岗位的实习招聘信息，对这个岗位非常向往，也非常希望能有机会参与贵司的实际业务。

我认为自己与该岗位有较高匹配度，主要体现在以下几点：
- 市场调研与用户洞察：在「Jackery」中，我围绕海外市场开展消费者偏好、竞品表现和产品机会分析，能够结合用户需求输出调研结论，为后续产品判断和市场策略提供支持。
- 数据分析与业务判断：在「亚马逊运营助理实习」中，我使用 Excel 和数据透视表对销量、点击率、转化等数据进行整理和分析，并协助优化定价、促销与产品组合。
- 跨团队协作与执行推进：在「校创新创业协会新媒体部门」中，我参与推进赛事与项目落地，能够在多人协作场景下完成信息同步、任务拆解与执行跟进，保障项目按计划推进。

此外，我过往已经积累了多段与该岗位高度相关的实习、项目与实践经历，也拥有较强的业务理解、执行能力与结果导向意识，能够较快适应岗位要求并投入实际工作。

我一直很向往能够加入贵司这样的团队，参与海外市场增长与GTM方向的实际业务，在真实项目中不断学习、积累经验并提升自己。如果有机会加入，我也希望能在持续成长的同时，为团队贡献实际价值。

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！`,
    },
    systemPrompt: COVER_LETTER_TYPE_1_SYSTEM_PROMPT,
  },
  {
    id: "cover-letter-story",
    category: "cover-letter",
    title: "成长潜力型",
    subtitle: "适用于经验较少但学习能力和动机明确的候选人",
    description: "强调自主学习、可迁移能力与岗位理解，适合经验较少但方向明确的投递场景。",
    userFacing: {
      template: `姓名—电话—投递岗位—立即到岗实习X个月+

尊敬的招聘负责人：

您好，我叫XXX，毕业于XXX学校XXX专业。我在小红书上看到了贵司XX岗位的实习招聘信息，对这个岗位非常向往，也非常希望能有机会参与贵司的实际业务。

虽然我暂时没有直接的XX岗位经验，但为了更好地匹配该岗位，我在1个月内自主学习了「岗位核心技能 / 工具 / 方法」，同时也在过往经历中积累了一些可迁移能力，主要体现在以下几点：

XXXX：结合「经历名称」，说明自己主动学习了哪些岗位核心技能，并如何结合课程 / 项目 / 实践完成相关任务。
XXXX：结合「经历名称」，说明自己具备哪些可迁移能力，例如跨团队沟通、信息整理、执行推进或问题拆解。
XXXX：结合「经历名称」，说明自己如何在真实项目 / 校园 / 实践中支持基础分析、执行落地或协作推进。

我持续关注XX方向，理解这个岗位不仅需要「理解1」，也需要「理解2」。对我来说，这个岗位不仅是一个执行入口，也是深入理解业务、积累行业认知和提升综合能力的重要机会。我也希望能在真实项目中持续学习，把已有的学习能力和实践能力逐步沉淀成更稳定的岗位能力。

我一直很向往能够加入贵司这样的团队，参与XX方向的实际业务，在真实项目中不断学习、积累经验并提升自己。如果有机会加入，我也希望能在持续成长的同时，为团队贡献实际价值。

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！`,
      example: `张同学—138XXXX5678—海外GTM—立即到岗实习3月+

尊敬的招聘负责人：

您好，我叫张同学，毕业于XX大学信息管理与信息系统专业。我在小红书上看到了贵司海外GTM岗位的实习招聘信息，对这个岗位非常向往，也非常希望能有机会参与贵司的实际业务。

虽然我暂时没有直接的海外GTM岗位经验，但为了更好地匹配该岗位，我在1个月内自主学习了市场分析、用户洞察和内容运营相关方法，同时也在过往经历中积累了一些可迁移能力，主要体现在以下几点：

核心岗位能力：结合「课程项目实践」，我在1个月内自主学习了市场分析、用户洞察和内容运营相关方法，并尝试把这些方法用于基础分析和内容输出。
可迁移能力：结合「校园项目实践」，我积累了跨团队沟通、信息整理、执行推进和问题拆解等能力，能够在多人协作中快速对齐信息并推进任务落地。
执行与协作支持：结合「校园活动组织经历」，我参与过任务分工、流程跟进和执行支持，能够在真实项目中配合团队完成基础分析、执行落地和协作推进。

我持续关注海外GTM方向，理解这个岗位不仅需要完成基础执行，也需要关注业务目标和跨团队协作。对我来说，这个岗位不仅是一个执行入口，也是深入理解业务、积累行业认知和提升综合能力的重要机会。我也希望能在真实项目中持续学习，把已有的学习能力和实践能力逐步沉淀成更稳定的岗位能力。

我一直很向往能够加入贵司这样的团队，参与海外市场增长与GTM方向的实际业务，在真实项目中不断学习、积累经验并提升自己。如果有机会加入，我也希望能在持续成长的同时，为团队贡献实际价值。

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！`,
    },
    systemPrompt: COVER_LETTER_TYPE_2_SYSTEM_PROMPT,
  },
  {
    id: "cover-letter-impact",
    category: "cover-letter",
    title: "基础匹配型",
    subtitle: "适用于已有一定相关基础、但经验还不算特别强的候选人",
    description: "强调已有基础、执行能力和岗位理解，适合已有1段左右相关经历的投递场景。",
    userFacing: {
      template: `【有相关经验】姓名—电话—投递岗位—立即到岗实习X个月+

尊敬的招聘负责人：

您好，我叫XXX，毕业于XXX学校XXX专业。我在小红书上看到了贵司XX岗位的实习招聘信息，对这个岗位非常向往，也非常希望能有机会参与贵司的实际业务。

我已经具备一定的XX岗位相关基础，为了更好地匹配该岗位，我也在过往经历中积累了与岗位相关的能力，主要体现在以下几点：

XXXX：结合「经历名称」，说明自己接触并完成过哪些与岗位相关的工作内容。
XXXX：结合「经历名称」，说明自己积累了哪些与岗位相关的技能、方法或执行能力。
XXXX：结合「经历名称」，说明自己如何支持基础分析、执行落地、协作推进或结果输出。

我持续关注XX方向，理解这个岗位不仅「理解1」，也「理解2」。对我来说，这个岗位是把已有相关经验进一步沉淀为稳定岗位能力的重要机会，我也希望能在真实项目中不断提升自己的业务理解和执行能力。

我一直很向往能够加入贵司这样的团队，参与XX方向的实际业务，在真实项目中不断学习、积累经验并提升自己。如果有机会加入，我也希望能在持续成长的同时，为团队贡献实际价值。

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！`,
      example: `【有相关经验】张同学—138XXXX5678—海外GTM—立即到岗实习3月+

尊敬的招聘负责人：

您好，我叫张同学，毕业于XX大学信息管理与信息系统专业。我在小红书上看到了贵司海外GTM岗位的实习招聘信息，对这个岗位非常向往，也非常希望能有机会参与贵司的实际业务。

我已经具备一定的海外GTM岗位相关基础，为了更好地匹配该岗位，我也在过往经历中积累了与岗位相关的能力，主要体现在以下几点：

市场调研与用户洞察：在「Jackery」中，我接触并完成过消费者偏好分析、竞品调研和产品机会判断等相关工作内容，对海外市场需求和用户偏好有一定理解。
数据分析与业务判断：在「亚马逊运营助理实习」期间，我积累了销量整理、点击率与转化分析、定价与促销支持等能力，能够配合完成基础分析和业务判断。
执行推进与协作支持：在「校创新创业协会新媒体部门」中，我参与过任务拆解、流程推进和跨团队协作，能够支持项目执行落地并配合团队完成相关工作。

我持续关注海外GTM方向，理解这个岗位不仅需要完成基础执行，也需要兼顾业务目标和跨团队协作。对我来说，这个岗位是把已有相关经验进一步沉淀为稳定岗位能力的重要机会，我也希望能在真实项目中不断提升自己的业务理解和执行能力。

我一直很向往能够加入贵司这样的团队，参与海外GTM方向的实际业务，在真实项目中不断学习、积累经验并提升自己。如果有机会加入，我也希望能在持续成长的同时，为团队贡献实际价值。

感谢您的阅读，期待有机会进一步沟通。

祝工作顺利！`,
    },
    systemPrompt: COVER_LETTER_TYPE_3_SYSTEM_PROMPT,
  },
];

const BOSS_GREETING_TYPE_1_SYSTEM_PROMPT = `请你基于我提供的 JD JSON、Draft JSON 以及第二页表单信息，严格生成一段 BOSS 直聘打招呼语。
不要输出任何解释、分析过程、标题说明或额外提示，只输出最终文案。

# 上下文说明
你会同时收到以下三份材料作为生成依据：
1. JD JSON：用于提炼岗位核心要求、能力关键词、业务重点
2. Draft JSON：用于提供候选人的真实经历、项目、成果与可引用事实
3. 第二页表单信息：
- 投递岗位名称
- 可实习时长
- 投递公司名称

# 使用原则
- JD JSON 决定岗位需要什么
- Draft JSON 决定候选人真实具备什么
- 第二页表单信息决定本次投递场景中的岗位名称、实习时长和公司名称
- 输出内容必须同时参考这三类信息
- 不允许只根据 JD JSON 空泛生成
- 不允许脱离 Draft JSON 编造经历、成果或能力证明
- 岗位名称与实习时长必须以第二页表单信息为准，不允许自行改写或替换

# 任务要求
1. 从 JD JSON 中提炼 3 个最核心的岗位能力关键词
2. 从 Draft JSON 中筛选与岗位最匹配的经历，优先选择最垂直、最直接相关的实习/项目经历
3. 严格按照下面固定结构输出，不能增删结构

# 输出结构
【有X段相关实习经验，可立即到岗实习X个月】
1.能力关键词1：在「公司名/项目」中，完成了具体工作，带来了明确业务结果。
2.能力关键词2：在「公司名/项目」中，负责相关任务，并输出了可量化成果或优化方案。
3.能力关键词3：在「公司名/项目」中，独立完成关键事项，支持业务推进。

此外，我还拥有「高含金量经历/竞赛/项目成果」。
该岗位是我未来希望长期发展的方向，非常期待在贵司项目中持续成长。

# 生成规则
1. X段相关实习经验中的 X，表示与目标岗位直接相关的经历数量
2. 相关指第二页表单中的投递岗位名称；如果岗位名称包含“实习生”，输出时删除这三个字，只保留岗位核心名称
3. 可立即到岗实习X个月中的时长，必须严格使用第二页表单中的可实习时长原始文本，保持原样输出，不允许改写为“X个月以上”等其他表达
4. 如果第二页表单中提供了投递公司名称，最后一句中的“贵司”可以自然替换为对应公司名称或与公司名称保持一致的表达
5. 3 条能力必须分别对应 JD JSON 中提炼出的 3 个核心能力点
6. 提炼岗位能力关键词时，必须优先选择既是 JD JSON 核心要求、又能在 Draft JSON 中找到明确经历佐证的能力点
7. 如果某个岗位能力关键词在 Draft JSON 中找不到足够明确的经历佐证，则不要强行使用该关键词，应替换为下一个同样重要、且能够被真实经历支撑的岗位能力关键词
8. 每一条能力描述都必须绑定一段真实经历，不允许空泛总结
9. “此外”这句只补充 1-2 个最强亮点，不能堆砌
10. 可以润色措辞，但不能改变整体结构

# 通用规则
1. 当文案中提到某一段实习、项目、校园经历或实践经历时，必须明确写出该段经历名称，并使用「」标注
2. 不允许只写“某段经历”“某个项目”“相关实践”这类模糊表达
3. 如果一句话里同时涉及公司名和项目名，优先选择最能代表该经历的一项，并使用「」标出
4. 所有能力描述、可迁移能力描述、亮点补充都应尽量落到具体经历名称上

# 风格要求
1. 招聘视角强
2. 业务感强
3. 信息密度高
4. 语气自然，不油腻，不夸张

# 长度要求
全文控制在 190-230 字`;

const BOSS_GREETING_TYPE_2_SYSTEM_PROMPT = `请你基于我提供的 JD JSON、Draft JSON 以及第二页表单信息，严格生成一段 BOSS 直聘打招呼语。
不要输出任何解释、分析过程、标题说明或额外提示，只输出最终文案。

# 上下文说明
你会同时收到以下三份材料作为生成依据：
1. JD JSON：用于提炼岗位核心要求、hard skill、能力关键词、业务重点
2. Draft JSON：用于提供候选人的真实经历、项目、成果与可引用事实
3. 第二页表单信息：
- 投递岗位名称
- 可实习时长
- 投递公司名称

# 使用原则
- JD JSON 决定岗位需要什么
- Draft JSON 决定候选人真实具备什么
- 第二页表单信息决定本次投递场景中的岗位名称、实习时长和公司名称
- 输出内容必须同时参考这三类信息
- 不允许脱离 Draft JSON 编造经历、成果或能力证明
- 岗位名称与实习时长必须以第二页表单信息为准，不允许自行改写或替换

# 任务要求
1. 严格按照下面固定结构输出，不能增删结构
2. 开头岗位名称直接使用第二页表单中的投递岗位名称；如果岗位名称中包含“实习生”，输出时删除这三个字，只保留岗位核心名称
3. 开头实习时长必须严格使用第二页表单中的可实习时长原始文本，保持原样输出
4. 核心岗位能力中的「岗位相关 hard skill / 工具 / 方法」必须直接来自 JD JSON，JD 中提到什么 hard skill 就写什么，不需要 Draft JSON 提供证据支撑
5. 可迁移能力必须根据 Draft JSON 的真实事实来写，同时尽量选择与 JD JSON 要求匹配的经历内容，不允许空泛发挥
6. 岗位理解中的内容可以结合 JD JSON 与模型对岗位的合理理解来写，但应尽可能使用 JD JSON 中出现的岗位关键词
7. 最后一段可以表达“目前没有直接相关经验，但持续学习、兴趣强、成长意愿强”，但不能写得过于弱势或自我否定
8. 如果第二页表单中提供了投递公司名称，最后一句中的“贵司”可以自然替换为对应公司名称或与公司名称保持一致的表达

# 通用规则
1. 当文案中提到某一段实习、项目、校园经历或实践经历时，必须明确写出该段经历名称，并使用「」标注
2. 不允许只写“某段经历”“某个项目”“相关实践”这类模糊表达
3. 如果一句话里同时涉及公司名和项目名，优先选择最能代表该经历的一项，并使用「」标出
4. 所有能力描述、可迁移能力描述、亮点补充都应尽量落到具体经历名称上

# 输出结构
【对XX岗位很感兴趣，可立即到岗实习X月+】
1.核心岗位能力：我在1个月内自主学习了「岗位相关 hard skill / 工具 / 方法」，并能够结合「课程 / 项目 / 实践」完成相关任务。
2.可迁移能力：我在「项目 / 校园 / 实践」中，积累了「跨团队沟通、信息整理、执行推进、问题拆解」等能力，例如「可以快速整理信息、配合多人协作推进任务，并支持基础分析或执行落地」。
3.岗位理解：我持续关注XX方向，理解这个岗位「通常不仅需要完成基础执行，还要关注业务目标、用户反馈、协作效率或结果转化」，也希望在真实业务场景中快速积累经验并沉淀能力。

虽然我暂时没有直接相关经验，但我对该岗位有很强兴趣，也一直在持续学习相关核心技能，并拥有「亮点经历 / 比赛 / 项目成果」，希望有机会在贵司项目中快速成长。

# 风格要求
1. 学习能力强
2. 成长潜力明确
3. 表达积极主动
4. 语气自然，不卑不亢
5. 不空泛，不油腻

# 长度要求
全文控制在 190-230 字`;

const BOSS_GREETING_TYPE_3_SYSTEM_PROMPT = `请你基于我提供的 JD JSON、Draft JSON 以及第二页表单信息，严格生成一段 BOSS 直聘打招呼语。不要输出任何解释、分析过程、标题说明或额外提示，只输出最终文案。

# 上下文说明
你会同时收到以下三份材料作为生成依据：
1. JD JSON：用于提炼岗位核心要求、hard skill、能力关键词、业务重点
2. Draft JSON：用于提供候选人的真实经历、项目、成果与可引用事实
3. 第二页表单信息：
- 投递岗位名称
- 可实习时长
- 投递公司名称

# 任务要求
1. 严格按照固定结构输出，不能增删结构
2. XX 直接使用第二页表单中的岗位名称；如果包含“实习生”，输出时删除这三个字
3. 时长严格使用第二页表单中的可实习时长原始文本
4. 优先从 Draft JSON 中筛选 1-2 段与岗位最匹配的真实经历，体现“有一定相关经验，但经验不算多”
5. 核心岗位能力和匹配能力必须以 Draft JSON 事实为依据，同时尽量回应 JD JSON 中的核心要求
6. 岗位理解可以结合 JD JSON 和模型合理理解生成，但应尽可能出现 JD JSON 中的岗位关键词
7. 结尾允许表达“经验仍在积累”，但整体语气要稳，不能显得过弱
8. 如果提供了投递公司名称，最后一句中的“贵司”可以自然替换

# 通用规则
1. 当文案中提到某一段实习、项目、校园经历或实践经历时，必须明确写出该段经历名称，并使用「」标注
2. 不允许只写“某段经历”“某个项目”“相关实践”这类模糊表达
3. 如果一句话里同时涉及公司名和项目名，优先选择最能代表该经历的一项，并使用「」标出
4. 不允许脱离 Draft JSON 编造经历、成果或能力证明

# 输出结构
【有一定XX岗位相关经验，可立即到岗实习X月+】
1.核心岗位能力：我在「相关实习 / 项目 / 实践名称」中，接触并完成过与岗位相关的工作内容，具备一定的岗位基础。
2.匹配能力：我在「相关实习 / 项目 / 实践名称」中，积累了与岗位相关的「hard skill / 工具 / 方法」以及执行推进能力，并能够支持基础分析、协作或结果输出。
3.岗位理解：我持续关注XX方向，理解这个岗位不仅需要完成基础执行，也需要兼顾业务目标、协作效率和实际效果，并希望在真实业务中进一步提升。

虽然我的相关经验还在持续积累中，但我已经具备一定基础，也拥有「亮点经历 / 项目成果 / 比赛经历」，希望有机会在贵司项目中继续成长并创造价值。

# 风格要求
1. 基础匹配明确
2. 语气稳妥
3. 业务感清楚
4. 不夸张，不空泛

# 长度要求
全文控制在 180-220 字`;

const GREETING_TEMPLATE_PLACEHOLDERS: WorkflowTemplateConfig[] = [
  {
    id: "greeting-high-match",
    category: "boss-greeting",
    title: "高度匹配型",
    subtitle: "适用于有多段垂直经验的候选人",
    description: "突出岗位匹配度、业务能力和相关成果，适合有多段垂直经历的投递场景。",
    userFacing: {
      template: `【有X段相关实习经验，可立即到岗实习X个月】
1.能力关键词1：在「公司名/项目」中，完成了具体工作，带来了明确业务结果。
2.能力关键词2：在「公司名/项目」中，负责相关任务，并输出了可量化成果或优化方案。
3.能力关键词3：在「公司名/项目」中，独立完成关键事项，支持业务推进。

此外，我还拥有「高含金量经历/竞赛/项目成果」。
该岗位是我未来希望长期发展的方向，非常期待在贵司项目中持续成长。`,
      example: `【有2段海外GTM实习经验，可以立即到岗实习5月+】
1.海外市场调研：在JACKERY实习期间有独立完成过Amazon消费者偏好以及产品两个方向的分析，可以精准定位热销品与用户需求。
2.本地化运营：有做过EcoFlow竞品社媒运营分析（TikTok/Instagram），可输出完整的优化方案。
3.跨境渠道拓展：独立完成海外客户订单处理，以及需求支持等工作。

除此之外本人还有一段「新东方」的国际教育部销售实习经验，以及全球T0级别营销大赛「欧莱雅Brandstorm」TOP100的名次，以及「AI新媒体创业」经历。
GTM是我未来的职业方向，我非常希望在贵司的出海项目中快速成长～`,
    },
    systemPrompt: BOSS_GREETING_TYPE_1_SYSTEM_PROMPT,
  },
  {
    id: "greeting-growth-potential",
    category: "boss-greeting",
    title: "成长潜力型",
    subtitle: "适用于经验较少但学习能力强的候选人",
    description: "突出自主学习、可迁移能力和岗位热情，适合经验较少但成长潜力明显的投递场景。",
    userFacing: {
      template: `【对XX岗位很感兴趣，可立即到岗实习X月+】
1.核心岗位能力：我在1个月内自主学习了「岗位相关 hard skill / 工具 / 方法」，并能够结合「课程 / 项目 / 实践」完成相关任务。
2.可迁移能力：我在「项目 / 校园 / 实践」中，积累了「跨团队沟通、信息整理、执行推进、问题拆解」等能力，例如「可以快速整理信息、配合多人协作推进任务，并支持基础分析或执行落地」。
3.岗位理解：我持续关注XX方向，理解这个岗位「通常不仅需要完成基础执行，还要关注业务目标、用户反馈、协作效率或结果转化」，也希望在真实业务场景中快速积累经验并沉淀能力。

虽然我暂时没有直接相关经验，但我对该岗位有很强兴趣，也一直在持续学习相关核心技能，并拥有「亮点经历 / 比赛 / 项目成果」，希望有机会在贵司项目中快速成长。`,
      example: `【对海外GTM岗位很感兴趣，可立即到岗实习3月+】
1.核心岗位能力：我在1个月内自主学习了市场分析、用户洞察和内容运营相关方法，并能够结合课程、项目和实践完成相关任务。
2.可迁移能力：我在校园项目和实践中，积累了跨团队沟通、信息整理、执行推进、问题拆解等能力，例如在某一个项目中推进任务，并支持基础分析或执行落地。
3.岗位理解：我持续关注海外GTM方向，理解这个岗位通常不仅需要完成基础执行，还要关注业务目标、快速拉通销售，营销，运营跨团队协作，也希望在真实业务场景中快速积累经验并沉淀能力。

虽然我暂时没有直接相关经验，但我对海外GTM岗位有很强兴趣，也一直在持续学习相关核心技能，并拥有比赛、项目和实践成果，希望有机会在贵司项目中快速成长。`,
    },
    systemPrompt: BOSS_GREETING_TYPE_2_SYSTEM_PROMPT,
  },
  {
    id: "greeting-basic-match",
    category: "boss-greeting",
    title: "基础匹配型",
    subtitle: "适用于有一定垂直经验但经验不多的候选人",
    description: "突出基础匹配度和可较快上手的潜力，适合已有1段左右相关经历的投递场景。",
    userFacing: {
      template: `【有一定XX岗位相关经验，可立即到岗实习X月+】
1.核心岗位能力：我在「相关实习 / 项目 / 实践名称」中，接触并完成过与岗位相关的工作内容，具备一定的岗位基础。
2.匹配能力：我在「相关实习 / 项目 / 实践名称」中，积累了与岗位相关的「hard skill / 工具 / 方法」以及执行推进能力，并能够支持基础分析、协作或结果输出。
3.岗位理解：我持续关注XX方向，理解这个岗位不仅需要完成基础执行，也需要兼顾业务目标、协作效率和实际效果，并希望在真实业务中进一步提升。

虽然我的相关经验还在持续积累中，但我已经具备一定基础，也拥有「亮点经历 / 项目成果 / 比赛经历」，希望有机会在贵司项目中继续成长并创造价值。`,
      example: `【有一定海外GTM岗位相关经验，可立即到岗实习3月+】
1.核心岗位能力：我在「Jackery」和「欧莱雅 Brandstorm」中，接触并完成过市场调研、用户洞察和内容分析等相关工作，具备一定的岗位基础。
2.匹配能力：我在「Jackery」中积累了市场分析、信息整理和执行推进能力，也在「欧莱雅 Brandstorm」中提升了策略拆解与协作表达能力，能够支持基础分析和项目落地。
3.岗位理解：我持续关注海外GTM方向，理解这个岗位不仅需要完成基础执行，也需要兼顾业务目标、团队协作和实际转化效果，并希望在真实业务中进一步提升。

虽然我的相关经验还在持续积累中，但我已经具备一定基础，也拥有项目和实践成果，希望有机会在贵司项目中继续成长并创造价值。`,
    },
    systemPrompt: BOSS_GREETING_TYPE_3_SYSTEM_PROMPT,
  },
];

const WORKFLOW_INTERNSHIP_DURATION_OPTIONS: readonly WorkflowInternshipDuration[] = [
  "可实习2月+",
  "可实习3月+",
  "可实习6月+",
] as const;

const PREVIEW_TOOLBAR_OPTIONS = {
  fontSize: [
    { value: "small" as const, label: "小" },
    { value: "standard" as const, label: "大" },
  ],
  density: [
    { value: "compact" as const, label: "紧凑" },
    { value: "standard" as const, label: "标准" },
    { value: "relaxed" as const, label: "舒展" },
  ],
  margin: [
    { value: "narrow" as const, label: "窄" },
    { value: "standard" as const, label: "宽" },
  ],
  fontFamily: [
    { value: "kaiti" as const, label: "楷体" },
    { value: "serif" as const, label: "宋体" },
  ],
  fontWeight: [
    { value: "light" as const, label: "细" },
    { value: "bold" as const, label: "粗" },
  ],
};

const PREVIEW_SLIDER_OPTIONS: Record<PreviewSliderKey, { label: string; unit: string; min: number; max: number; step: number }> = {
  verticalMarginMm: { label: "上下边距", unit: "mm", ...PREVIEW_VERTICAL_MARGIN_RANGE },
  unitGapPx: { label: "板块内经历间隔", unit: "px", ...PREVIEW_UNIT_GAP_RANGE },
  sectionGapPx: { label: "板块间隔", unit: "px", ...PREVIEW_SECTION_GAP_RANGE },
};

const PREVIEW_MIN_ZOOM = 1;
const PREVIEW_MAX_ZOOM = 3;

function getPreviewRenderStyles(settings?: PreviewSettings): PreviewRenderStyles {
  if (!settings) {
    return {
      basicInfoStack: "space-y-2",
      educationStack: "space-y-4",
      itemStack: "space-y-2",
      nameText: "text-[22pt] font-semibold text-slate-900",
      titleText: "text-sm font-semibold text-slate-900",
      metaText: "text-xs text-slate-500",
      bodyText: "text-sm leading-6 text-slate-800",
      bodyGroup: "space-y-1 text-sm leading-6 text-slate-800",
      list: "space-y-2 text-sm leading-6 text-slate-800",
      honorList: "list-disc space-y-1 pl-5",
      labelText: "font-medium text-slate-900",
    };
  }

  const fontSizeClass = PREVIEW_FONT_SIZE_CLASS[settings.fontSize];
  const density = PREVIEW_DENSITY_CONFIG[settings.density];
  const fontFamily = PREVIEW_FONT_FAMILY_CLASS[settings.fontFamily];
  const weights = PREVIEW_WEIGHT_CONFIG[settings.fontWeight];

  return {
    basicInfoStack: density.itemGap,
    educationStack: density.unitGap,
    itemStack: density.itemGap,
    nameText: `${fontFamily} ${weights.title} ${fontSizeClass.name} text-slate-900`,
    titleText: `${fontFamily} ${weights.title} ${fontSizeClass.heading} text-slate-900`,
    metaText: `${fontFamily} ${fontSizeClass.meta} text-slate-500`,
    bodyText: `${fontFamily} ${weights.body} ${fontSizeClass.body} text-slate-800`,
    bodyGroup: `${density.itemGap} ${fontFamily} ${weights.body} ${fontSizeClass.body} text-slate-800`,
    list: `${density.listGap} ${fontFamily} ${weights.body} ${fontSizeClass.body} text-slate-800`,
    honorList: `list-disc ${density.listGap} pl-5`,
    labelText: `${weights.title} text-slate-900`,
  };
}

const OPTIMIZE_REWRITE_RULES = [
  "本次修改作用域以用户指定目标为准，可以是某个 bullet，也可以是整段经历",
  "如果本次目标是某个 bullet，则不要修改同一经历中的其他 bullet",
  "如果本次目标是整段经历，则可在该段经历范围内整体调整表达，但不要改动其他板块内容",
  "不要修改与本次目标无关的内容",
  "不得把“参与”改写为“主导”，除非当前内容已有明确支持",
  "不得添加明显超出候选人身份、职责或权限范围的夸大表述",
  "不要使用“学习到了”“锻炼了”“提高了”“收获很多”等学生式表达",
  "不要把“具备……能力”“提升……能力”“擅长……”等结论性表达作为句子核心",
  "优先写清楚动作、对象、方法、产出和结果",
  "如果 JD JSON 中存在明确原词，应优先直接使用原词，不得替换为同义词、近义词或更泛化表达",
];
const BRANCH_QUICK_ACTIONS: Record<QuickActionSectionKey, QuickAction[]> = {
  basic_info: [
    {
      label: "增加目标岗位",
      prompt:
        "请在基本信息中补充意向岗位【请输入你的目标岗位】，并保持整体表达简洁、规范、适合简历展示。并以【意向岗位：XXX】的形式输出。",
    },
    {
      label: "增加作品集链接",
      prompt:
        "请在基本信息中补充作品集链接【请输入你的作品集链接】，并保持整体格式统一、表达简洁。",
    },
    {
      label: "增加 GitHub 链接",
      prompt:
        "请在基本信息中补充 GitHub 链接【请输入你的 GitHub 链接】，并保持整体格式统一、表达简洁。",
    },
    {
      label: "去掉非“党员”的政治面貌",
      prompt: "请删除基本信息中非“党员”的政治面貌信息，保留整体版式整洁。",
    },
    {
      label: "规范联系方式表达",
      prompt:
        "请将基本信息中的“电话”信息整理得更规范、更适合简历展示。请将电话号码统一标准化为“电话：11位手机号”，去掉空格、短横线、括号和 +86，不要修改号码本身。",
    },
  ],
  education: [
    {
      label: "学历由高到低排序",
      prompt: "请将教育背景板块按学历层级由高到低排序；同学历下再按时间倒序排列，并保持其他内容不变。",
    },
    {
      label: "隐藏专升本的专科相关学历信息",
      prompt: "请在教育背景板块中隐藏与专升本前专科阶段相关的教育经历信息，其余教育内容保持不变。",
    },
    {
      label: "隐藏已有的 GPA 和排名",
      prompt: "请在教育背景板块中隐藏所有教育经历里的 GPA 和年级排名信息，并保持其他内容不变。",
    },
    {
      label: "隐藏已有的荣誉/奖学金",
      prompt: "请在教育背景板块中隐藏所有教育经历里的荣誉、奖学金信息，并保持其他内容不变。",
    },
    {
      label: "隐藏已有的主修课程",
      prompt: "请在教育背景板块中隐藏所有教育经历里的主修课程信息，并保持其他内容不变。",
    },
    {
      label: "隐藏某段教育经历的 GPA 和排名",
      prompt:
        "请在教育背景板块中隐藏【请输入要处理的学校名称或教育经历标识】这段教育经历里的 GPA 和年级排名信息，其余教育内容保持不变。",
    },
    {
      label: "隐藏某段教育经历的荣誉/奖学金",
      prompt:
        "请在教育背景板块中隐藏【请输入要处理的学校名称或教育经历标识】这段教育经历里的荣誉、奖学金信息，其余教育内容保持不变。",
    },
    {
      label: "隐藏某段教育经历的主修课程",
      prompt:
        "请在教育背景板块中隐藏【请输入要处理的学校名称或教育经历标识】这段教育经历里的主修课程信息，其余教育内容保持不变。",
    },
  ],
  skills: [
    {
      label: "精简技能列表",
      prompt: "请精简技能工具部分，删除重复、冗余或价值较低的内容，仅保留核心技能。",
    },
    {
      label: "删除岗位弱相关技能",
      prompt: "请删除技能工具中与目标岗位弱相关的技能，保留最有助于岗位匹配的内容。",
    },
    {
      label: "表达更专业",
      prompt: "请将技能工具部分改写得更专业、更适合简历表达，同时保持内容清晰。",
    },
    {
      label: "强化岗位相关技能",
      prompt: "请强化技能工具中与目标岗位最相关的技能表达，并优先突出核心技能。",
    },
  ],
  personal_advantages: [
    {
      label: "强化岗位匹配",
      prompt: "请让个人优势部分更贴合目标岗位要求，突出最有岗位相关性的内容。",
    },
    {
      label: "拆分为 bullet",
      prompt:
        "请将个人优势部分拆分为更清晰的 bullet 表达，便于阅读和简历展示。（输出格式—关键词：具体描述）每个 bullet 都需要单独一行，不能连在一起。",
    },
    {
      label: "压缩篇幅",
      prompt: "请压缩个人优势部分篇幅，删除空泛或重复表述，仅保留核心亮点。",
    },
    {
      label: "改得更职业化",
      prompt: "请将个人优势部分改写得更职业化、更成熟，减少学生感和空泛表达。",
    },
  ],
};

const DEGREE_OPTIONS = ["专科", "本科", "硕士", "博士", "交换项目"];
const POLITICAL_STATUS_OPTIONS = ["群众", "共青团员", "中共党员", "中共预备党员"];
const OTHER_EXPERIENCE_TYPE_OPTIONS: OtherExperienceType[] = ["校园", "创业", "自媒体", "科研", "比赛"];
const RANKING_OPTIONS = ["前1%", "前5%", "前10%", "前20%"];
const COLLAPSIBLE_SECTION_LABELS: Record<CollapsibleSectionKey, string> = {
  internships: "实习经历",
  projects: "项目经历",
  otherExperiences: "其他经历",
  skills: "技能工具",
  selfSummary: "自我评价/优势",
};
const SKILL_CATEGORY_LABELS: Record<SkillCategoryKey, string> = {
  officeTools: "办公工具",
  dataTools: "数据工具",
  designTools: "设计工具",
  contentTools: "内容工具",
  aiTools: "AI 工具",
  languageSkills: "语言能力",
  certifications: "证书",
};

const SKILL_OPTIONS = {
  officeTools: ["Excel", "PPT", "Word", "Google Sheets", "Google Docs", "Google Slides", "WPS", "飞书文档", "石墨文档"],
  dataTools: [
    "SQL",
    "Python",
    "R",
    "SPSS",
    "Tableau",
    "Power BI",
    "Looker Studio",
    "Google Analytics",
    "百度统计",
    "GrowingIO",
    "Mixpanel",
  ],
  designTools: ["Canva", "Photoshop", "Illustrator", "Figma", "Sketch", "Axure", "稿定设计", "醒图"],
  contentTools: ["剪映", "CapCut", "Premiere", "After Effects", "秀米", "135编辑器", "新榜", "蝉妈妈", "巨量算数", "小红书创作平台"],
  aiTools: ["ChatGPT", "Claude", "Claude Code", "Codex", "Cursor", "Gemini", "Antigravity"],
  languageSkills: [
    "CET-4",
    "CET-6",
    "IELTS",
    "TOEFL",
    "TEM-4",
    "TEM-8",
    "日语 N1",
    "日语 N2",
    "韩语 TOPIK",
    "法语 DELF/DALF",
    "德语 TestDaF/DSH",
    "西班牙语 DELE",
    "俄语 TORFL",
    "意大利语 CILS/CELI",
    "葡萄牙语 CAPLE",
    "阿拉伯语",
    "泰语",
    "越南语",
  ],
  certifications: ["教师资格证", "证券从业", "基金从业", "CPA", "初级会计", "计算机二级", "普通话证书", "人力资源证书"],
} as const;

function isRemovableSection(sectionKey: SectionKey) {
  return (
    sectionKey === "internships" ||
    sectionKey === "projects" ||
    sectionKey === "other_experiences" ||
    sectionKey === "skills" ||
    sectionKey === "personal_advantages"
  );
}

function isOptimizableSection(sectionKey: SectionKey): sectionKey is OptimizableSectionKey {
  return (
    sectionKey === "internships" ||
    sectionKey === "projects" ||
    sectionKey === "other_experiences"
  );
}

function isQuickActionSection(sectionKey: SectionKey): sectionKey is QuickActionSectionKey {
  return (
    sectionKey === "basic_info" ||
    sectionKey === "education" ||
    sectionKey === "skills" ||
    sectionKey === "personal_advantages"
  );
}

function createEducationItem(): EducationFormItem {
  return {
    school: "",
    degree: "",
    major: "",
    startDate: "",
    endDate: "",
    gpa: "",
    ranking: "",
    courses: [""],
    honors: [""],
  };
}

function createExperienceItem(): ExperienceFormItem {
  return {
    company: "",
    role: "",
    startDate: "",
    endDate: "",
    bullets: "",
  };
}

function createProjectItem(): ProjectFormItem {
  return {
    name: "",
    role: "",
    startDate: "",
    endDate: "",
    bullets: "",
  };
}

function createOtherExperienceItem(): OtherExperienceFormItem {
  return {
    type: "校园",
    name: "",
    role: "",
    startDate: "",
    endDate: "",
    bullets: "",
  };
}

async function parseApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error("接口返回为空，请稍后重试");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("接口返回格式异常，请稍后重试");
  }
}

function formatDateRange(startDate?: string, endDate?: string) {
  return [startDate?.trim() ?? "", endDate?.trim() ?? ""].filter(Boolean).join(" - ");
}

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function clampPreviewZoom(value: number) {
  return Math.min(PREVIEW_MAX_ZOOM, Math.max(PREVIEW_MIN_ZOOM, value));
}

function PreviewToolbarIcon({ kind }: { kind: "trigger" | "fontSize" | "fontFamily" | "fontWeight" | "margin" | "verticalMarginMm" | "unitGapPx" | "sectionGapPx" }) {
  switch (kind) {
    case "fontSize":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M4.5 15.5 8 4.5h.4l3.5 11M5.6 12.2h5.2M12.7 8.5h2.8m-1.4 0v7"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "fontFamily":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M4 5.5h12M7 5.5V15m6-9.5V15M6 15h8"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "fontWeight":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M6 4.5h4.1a3 3 0 0 1 0 6H6zm0 6h4.8a3 3 0 0 1 0 6H6z"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "margin":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M4.5 4.5v11m11-11v11M7.5 10h5m-3-2 3 2-3 2"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "verticalMarginMm":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M6.5 4.5h7m-7 11h7M10 7v6m0 0-2-2m2 2 2-2m-2-4-2 2m2-2 2 2"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "unitGapPx":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M5 5.5h10M5 14.5h10M7.5 9h5M10 7v6"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "sectionGapPx":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M4.5 5.5h11M4.5 10h11M4.5 14.5h11M7.5 7.2v5.6m5-5.6v5.6"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "trigger":
    default:
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M4.5 5.5h11M4.5 10h11M4.5 14.5h7m3-1.8 1.5 1.5 2.5-3"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

function PreviewStepIcon({ direction }: { direction: "decrease" | "increase" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path
        d={direction === "decrease" ? "M12.5 5.5 7.5 10l5 4.5" : "M7.5 5.5 12.5 10l-5 4.5"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getPreviewToolbarShortLabel(
  group: "fontSize" | "fontFamily" | "fontWeight" | "margin",
  value: string,
) {
  if (group === "fontFamily") {
    return value === "kaiti" ? "楷" : "宋";
  }

  if (group === "fontSize") {
    return value === "small" ? "小" : value === "large" ? "特" : "大";
  }

  if (group === "fontWeight") {
    return value === "light" ? "细" : value === "bold" ? "粗" : "中";
  }

  if (group === "margin") {
    return value === "narrow" ? "窄" : value === "wide" ? "宽" : "宽";
  }

  return value;
}

function getTouchDistance(event: TouchEvent<HTMLElement>) {
  if (event.touches.length < 2) {
    return null;
  }

  const [firstTouch, secondTouch] = [event.touches[0], event.touches[1]];
  return Math.hypot(secondTouch.clientX - firstTouch.clientX, secondTouch.clientY - firstTouch.clientY);
}

function buildConfirmationQueue(draftJson: DraftJson): ConfirmationUnit[] {
  return [
    {
      id: "basic_info",
      sectionKey: "basic_info",
      label: "基本信息",
      itemIndex: null,
    },
    {
      id: "education",
      sectionKey: "education",
      label: "教育背景",
      itemIndex: null,
    },
    ...draftJson.internships.items.map((item, index) => ({
      id: item.id || `internships-${index + 1}`,
      sectionKey: "internships" as const,
      label: "实习经历",
      itemIndex: index,
    })),
    ...draftJson.projects.items.map((item, index) => ({
      id: item.id || `projects-${index + 1}`,
      sectionKey: "projects" as const,
      label: "项目经历",
      itemIndex: index,
    })),
    ...draftJson.other_experiences.items.map((item, index) => ({
      id: item.id || `other-experiences-${index + 1}`,
      sectionKey: "other_experiences" as const,
      label: item.type ? `${item.type}经历` : "其他经历",
      itemIndex: index,
    })),
    ...(draftJson.skills.items.some((item) => item.label?.trim() || item.content?.trim())
      ? [
          {
            id: "skills",
            sectionKey: "skills" as const,
            label: "技能工具",
            itemIndex: null,
          },
        ]
      : []),
    ...(draftJson.personal_advantages.items.some((item) => item.content.trim())
      ? [
          {
            id: "personal_advantages",
            sectionKey: "personal_advantages" as const,
            label: "个人优势",
            itemIndex: null,
          },
        ]
      : []),
  ];
}

function buildUnitMessage(unit: ConfirmationUnit) {
  return `我先帮你整理了【${unit.label}】，请确认是否采用。`;
}

function buildBranchRoundDividerText(round: number) {
  return `第 ${round} 轮修改`;
}

function createInitialBranchMemory(initialVersion: BranchEditableTarget): BranchMemory {
  return {
    mode: null,
    lastOptimizedVersion: initialVersion,
  };
}

function createBranchSandboxState(params: {
  unit: ConfirmationUnit;
  currentDraft: BranchEditableTarget;
  targetJd: unknown;
  targetJobTitle: string;
  gapContext?: GapContextItem[];
}) {
  const { unit, currentDraft, targetJd, targetJobTitle, gapContext } = params;
  const now = new Date().toISOString();

  return createEmptySandboxRuntimeState<BranchEditableTarget, unknown, BranchEditableTarget>({
    sandboxContext: {
      sandboxId: `local-${unit.sectionKey}-${unit.id}`,
      userId: "local-user",
      resumeId: "local-resume",
      jobId: targetJobTitle.trim() || "local-job",
      sessionId: `session-${unit.id}`,
      targetSection: unit.sectionKey,
      targetUnitId: unit.id,
      status: "active",
    },
    currentDraft,
    targetJob: {
      title: targetJobTitle.trim(),
      jd: targetJd,
    },
    resumeRules: OPTIMIZE_REWRITE_RULES,
    latestUserInstruction: "",
    gapContext: gapContext ?? [],
    optimizeResult: {
      optimizedDraft: currentDraft,
    },
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
  });
}

function createEmptyBranchGapAssignmentItemState(): BranchGapAssignmentItemState {
  return createEmptyGapAssignmentItem();
}

function createBranchGapFormStateFromAnalysis(
  analysis: GlobalGapAnalysisSuccess | null,
  previous?: BranchGapFormState,
): BranchGapFormState {
  const previousAssignments = previous?.assignments ?? {};
  const nextAssignments = Object.fromEntries(
    (analysis?.gaps ?? []).map((gap) => [
      gap.gapId,
      previousAssignments[gap.gapId] ?? createEmptyBranchGapAssignmentItemState(),
    ]),
  ) as Record<string, BranchGapAssignmentItemState>;

  return {
    assignments: nextAssignments,
    submitting: previous?.submitting ?? false,
    completed: previous?.completed ?? false,
  };
}

function buildGapContextItemFromResult(
  gap: GlobalGapItem,
  result: Extract<BranchMemoryWriterResponse, { userAnswer: string }>,
): GapContextItem {
  return {
    gapId: gap.gapId,
    gapType: gap.gapType,
    gapTitle: gap.gapTitle,
    mainQuestion: gap.mainQuestion,
    status: result.status,
    userAnswer: result.userAnswer,
    answerStatus: result.answerStatus,
    extractedPositiveFacts: result.extractedPositiveFacts,
    extractedNegativeFacts: result.extractedNegativeFacts,
    isCurrentGap: false,
  };
}

function getDraftPreviewWithOptimizedUnit(
  draftJson: DraftJson,
  unit: ConfirmationUnit,
  optimizedItem?: BranchEditableTarget,
) {
  if (!optimizedItem) {
    return draftJson;
  }

  return applyOptimizedItemToDraftJson(draftJson, unit, optimizedItem);
}

function buildBranchPlanningState(
  phase: BranchPlanningPhase,
  overrides?: Partial<Omit<BranchPlanningState, "phase" | "visible">>,
): BranchPlanningState {
  const defaults: Record<BranchPlanningPhase, BranchPlanningState> = {
    "initial-analyzing": {
      visible: true,
      phase: "initial-analyzing",
      title: "正在分析这段经历和目标岗位之间最值得优先补的地方",
      subtext: "我会先看当前版本写了什么，再决定先从哪一个关键点开始问你。",
      nextStep: "给出第一个关键问题",
      showPreview: true,
      lockInput: true,
    },
    "direct-editing": {
      visible: true,
      phase: "direct-editing",
      title: "正在整理这段经历里已经确认过的信息，准备直接改写",
      subtext: "你已经给了明确方向，所以我不会继续停留在追问里。",
      decision: "接下来直接进入新版生成。",
      nextStep: "生成新的经历版本",
      lockInput: true,
    },
    generating: {
      visible: true,
      phase: "generating",
      title: "正在把前面确认过的信息整理进当前版本",
      subtext: "我会尽量保留原有真实内容，同时把新增信息自然融合进去。",
      nextStep: "输出新的可采用版本",
      lockInput: true,
    },
  };

  return {
    ...defaults[phase],
    ...overrides,
    visible: true,
    phase,
  };
}

function updateSandboxOptimizeResult(
  sandboxState: BranchSandboxState,
  optimizedDraft: BranchEditableTarget,
) {
  return {
    ...sandboxState,
    currentDraft: optimizedDraft,
    optimizeResult: {
      optimizedDraft,
    },
    timestamps: {
      ...sandboxState.timestamps,
      updatedAt: new Date().toISOString(),
    },
  };
}

function parseJdJsonInput(value: string) {
  try {
    return value.trim() ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function parseStoredJsonOrThrow(value: string, label: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${label}为空，暂时无法继续`);
  }

  try {
    return JSON.parse(trimmedValue) as unknown;
  } catch {
    throw new Error(`${label}格式异常，请重新生成或重新上传后再试`);
  }
}

function buildBranchTitle(unit: ConfirmationUnit, draftJson: DraftJson) {
  if (unit.sectionKey === "internships" && unit.itemIndex !== null) {
    const item = draftJson.internships.items[unit.itemIndex];
    const company = item?.company?.trim();
    const role = item?.role?.trim();
    return [unit.label, company, role].filter(Boolean).join(" · ");
  }

  if (unit.sectionKey === "projects" && unit.itemIndex !== null) {
    const item = draftJson.projects.items[unit.itemIndex];
    const name = item?.name?.trim();
    const role = item?.role?.trim();
    return [unit.label, name, role].filter(Boolean).join(" · ");
  }

  if (unit.sectionKey === "other_experiences" && unit.itemIndex !== null) {
    const item = draftJson.other_experiences.items[unit.itemIndex];
    const name = item?.name?.trim();
    const role = item?.role?.trim();
    return [unit.label, name, role].filter(Boolean).join(" · ");
  }

  return unit.label;
}

function toNonEmptyList(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean);
}

function splitTextAreaLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}


function normalizeMonthValue(value?: string) {
  const raw = value?.trim();
  if (!raw) {
    return "";
  }

  const normalized = raw
    .replace(/年/g, "-")
    .replace(/月/g, "")
    .replace(/[./]/g, "-")
    .replace(/\s+/g, "");

  const fullMatch = normalized.match(/(19|20)\d{2}-(0?[1-9]|1[0-2])/);
  if (fullMatch) {
    const [year, month] = fullMatch[0].split("-");
    return `${year}-${month.padStart(2, "0")}`;
  }

  const yearMatch = normalized.match(/(19|20)\d{2}/);
  if (yearMatch) {
    return `${yearMatch[0]}-01`;
  }

  return "";
}

function normalizeRankingValue(value?: string) {
  const raw = value?.trim();
  if (!raw) {
    return "";
  }

  if (RANKING_OPTIONS.includes(raw)) {
    return raw;
  }

  const normalized = raw.replace(/\s+/g, "").replace("％", "%");
  if (normalized.includes("前1")) {
    return "前1%";
  }
  if (normalized.includes("前5")) {
    return "前5%";
  }
  if (normalized.includes("前10")) {
    return "前10%";
  }
  if (normalized.includes("前20")) {
    return "前20%";
  }

  return "";
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function hasDraggedFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return false;
  }

  const types = Array.from(dataTransfer.types ?? []);
  return types.includes("Files");
}

function getDroppedFile(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return null;
  }

  return (
    dataTransfer.files?.[0] ??
    Array.from(dataTransfer.items ?? [])
      .find((item) => item.kind === "file")
      ?.getAsFile() ??
    null
  );
}

function normalizeDegreeValue(value?: string) {
  const raw = value?.trim();
  if (!raw) {
    return "";
  }

  const normalized = raw.replace(/\s+/g, "");
  if (normalized.includes("交换")) {
    return "交换项目";
  }
  if (normalized === "学士" || normalized.includes("本科")) {
    return "本科";
  }
  if (normalized === "硕士" || normalized.includes("研究生")) {
    return "硕士";
  }
  if (normalized === "博士") {
    return "博士";
  }
  if (normalized === "专科" || normalized === "大专") {
    return "专科";
  }

  return DEGREE_OPTIONS.includes(raw) ? raw : "";
}

function hasMeaningfulValue(value?: string) {
  return Boolean(value?.trim());
}

function hasMeaningfulList(items?: string[]) {
  return Boolean(items?.some((item) => item.trim()));
}

function buildCollapsedSectionsFromForm(form: ResumeFormState): Record<CollapsibleSectionKey, boolean> {
  return {
    internships: !form.internships.some(
      (item) =>
        hasMeaningfulValue(item.company) ||
        hasMeaningfulValue(item.role) ||
        hasMeaningfulValue(item.startDate) ||
        hasMeaningfulValue(item.endDate) ||
        hasMeaningfulValue(item.bullets),
    ),
    projects: !form.projects.some(
      (item) =>
        hasMeaningfulValue(item.name) ||
        hasMeaningfulValue(item.role) ||
        hasMeaningfulValue(item.startDate) ||
        hasMeaningfulValue(item.endDate) ||
        hasMeaningfulValue(item.bullets),
    ),
    otherExperiences: !form.otherExperiences.some(
      (item) =>
        hasMeaningfulValue(item.name) ||
        hasMeaningfulValue(item.role) ||
        hasMeaningfulValue(item.startDate) ||
        hasMeaningfulValue(item.endDate) ||
        hasMeaningfulValue(item.bullets),
    ),
    skills: !Object.values(form.skills).some((items) => items.length > 0),
    selfSummary: !hasMeaningfulValue(form.selfSummary),
  };
}

function buildCollapsedSkillCategoriesFromForm(form: ResumeFormState): Record<SkillCategoryKey, boolean> {
  return {
    officeTools: form.skills.officeTools.length === 0,
    dataTools: form.skills.dataTools.length === 0,
    designTools: form.skills.designTools.length === 0,
    contentTools: form.skills.contentTools.length === 0,
    aiTools: form.skills.aiTools.length === 0,
    languageSkills: form.skills.languageSkills.length === 0,
    certifications: form.skills.certifications.length === 0,
  };
}

function mapResumeJsonToFormState(resumeJson: ParsedResumeJson): ResumeFormState {
  const educationItems =
    resumeJson.education?.length
      ? resumeJson.education.map((item) => ({
          school: item.school ?? "",
          degree: normalizeDegreeValue(item.degree),
          major: item.major ?? "",
          startDate: normalizeMonthValue(item.start_date),
          endDate: normalizeMonthValue(item.end_date),
          gpa: item.gpa ?? "",
          ranking: normalizeRankingValue(item.ranking),
          courses: item.courses?.length ? item.courses : [""],
          honors: item.honors?.length ? item.honors : [""],
        }))
      : [createEducationItem()];

  const internshipItems =
    resumeJson.internships?.length
      ? resumeJson.internships.map((item) => ({
          company: item.company ?? "",
          role: item.role ?? "",
          startDate: normalizeMonthValue(item.start_date),
          endDate: normalizeMonthValue(item.end_date),
          bullets: item.bullets?.join("\n") ?? "",
        }))
      : [createExperienceItem()];

  const projectItems =
    resumeJson.projects?.length
      ? resumeJson.projects.map((item) => ({
          name: item.name ?? "",
          role: item.role ?? "",
          startDate: normalizeMonthValue(item.start_date),
          endDate: normalizeMonthValue(item.end_date),
          bullets: item.bullets?.join("\n") ?? "",
        }))
      : [createProjectItem()];

  const otherItems =
    resumeJson.other_experiences?.length
      ? resumeJson.other_experiences.map((item) => ({
          type: item.type ?? "校园",
          name: item.name ?? "",
          role: item.role ?? "",
          startDate: normalizeMonthValue(item.start_date),
          endDate: normalizeMonthValue(item.end_date),
          bullets: item.bullets?.join("\n") ?? "",
        }))
      : [createOtherExperienceItem()];

  return {
    basicInfo: {
      name: resumeJson.basic_info?.name ?? "",
      phone: resumeJson.basic_info?.phone ?? "",
      email: resumeJson.basic_info?.email ?? "",
      targetRole: resumeJson.basic_info?.target_role ?? "",
      portfolio: resumeJson.basic_info?.portfolio ?? "",
      github: resumeJson.basic_info?.github ?? "",
      politicalStatus: resumeJson.basic_info?.political_status ?? "",
    },
    education: educationItems,
    internships: internshipItems,
    projects: projectItems,
    otherExperiences: otherItems,
    skills: {
      officeTools: resumeJson.skills?.office_tools ?? [],
      dataTools: resumeJson.skills?.data_tools ?? [],
      designTools: resumeJson.skills?.design_tools ?? [],
      contentTools: resumeJson.skills?.content_tools ?? [],
      aiTools: resumeJson.skills?.ai_tools ?? [],
      languageSkills: resumeJson.skills?.language_skills ?? [],
      certifications: resumeJson.skills?.certifications ?? [],
    },
    selfSummary: resumeJson.self_summary ?? "",
  };
}

function buildResumeJsonFromForm(form: ResumeFormState) {
  return {
    basic_info: {
      phone: form.basicInfo.phone.trim(),
      email: form.basicInfo.email.trim(),
      name: form.basicInfo.name.trim(),
      target_role: form.basicInfo.targetRole.trim(),
      portfolio: form.basicInfo.portfolio.trim(),
      github: form.basicInfo.github.trim(),
      political_status: form.basicInfo.politicalStatus.trim(),
    },
    education: form.education.map((item) => ({
      school: item.school.trim(),
      degree: item.degree.trim(),
      major: item.major.trim(),
      start_date: item.startDate.trim(),
      end_date: item.endDate.trim(),
      gpa: item.gpa.trim(),
      ranking: item.ranking.trim(),
      courses: toNonEmptyList(item.courses),
      honors: toNonEmptyList(item.honors),
    })),
    internships: form.internships.map((item) => ({
      company: item.company.trim(),
      role: item.role.trim(),
      start_date: item.startDate.trim(),
      end_date: item.endDate.trim(),
      bullets: splitTextAreaLines(item.bullets),
    })),
    projects: form.projects.map((item) => ({
      name: item.name.trim(),
      role: item.role.trim(),
      start_date: item.startDate.trim(),
      end_date: item.endDate.trim(),
      bullets: splitTextAreaLines(item.bullets),
    })),
    other_experiences: form.otherExperiences.map((item) => ({
      type: item.type,
      name: item.name.trim(),
      role: item.role.trim(),
      start_date: item.startDate.trim(),
      end_date: item.endDate.trim(),
      bullets: splitTextAreaLines(item.bullets),
    })),
    skills: {
      office_tools: toNonEmptyList(form.skills.officeTools),
      data_tools: toNonEmptyList(form.skills.dataTools),
      design_tools: toNonEmptyList(form.skills.designTools),
      content_tools: toNonEmptyList(form.skills.contentTools),
      ai_tools: toNonEmptyList(form.skills.aiTools),
      language_skills: toNonEmptyList(form.skills.languageSkills),
      certifications: toNonEmptyList(form.skills.certifications),
    },
    self_summary: form.selfSummary.trim(),
  };
}

function renderUnitPreview(unit: ConfirmationUnit, draftJson: DraftJson, renderStyles: PreviewRenderStyles = getPreviewRenderStyles()) {
  if (unit.sectionKey === "basic_info") {
    const items = draftJson.basic_info?.items ?? [];
    const getValueByLabel = (...labels: string[]) =>
      items.find((item) => labels.includes(item.label.trim()))?.value?.trim() ?? "";

    const name = getValueByLabel("姓名");
    const phone = getValueByLabel("电话", "手机号");
    const email = getValueByLabel("邮箱", "Email", "email");
    const targetRole = getValueByLabel("意向岗位", "目标岗位");
    const portfolio = getValueByLabel("作品集");
    const github = getValueByLabel("GitHub", "Github", "github");

    const secondRow = [
      phone ? `电话：${phone}` : "",
      email ? `邮箱：${email}` : "",
      targetRole ? `意向岗位：${targetRole}` : "",
    ].filter(Boolean);

    const thirdRow = [
      portfolio ? `作品集：${portfolio}` : "",
      github ? `GitHub：${github}` : "",
    ].filter(Boolean);

    const fallbackItems = items.filter((item) => item.label.trim() && item.value.trim());

    return (
      <div className="space-y-0.5 text-center">
        {name ? (
          <p data-preview-break="true" className={`${renderStyles.nameText} leading-tight tracking-[0.01em]`}>
            {name}
          </p>
        ) : null}
        {secondRow.length > 0 ? (
          <p data-preview-break="true" className={`${renderStyles.bodyText} leading-4`}>{secondRow.join(" | ")}</p>
        ) : null}
        {thirdRow.length > 0 ? (
          <p data-preview-break="true" className={`${renderStyles.bodyText} leading-4`}>{thirdRow.join(" | ")}</p>
        ) : null}
        {!name && secondRow.length === 0 && thirdRow.length === 0
          ? fallbackItems.map((item, index) => (
              <p key={`${item.label}-${index}`} data-preview-break="true" className={renderStyles.bodyText}>
                <span className={renderStyles.labelText}>{item.label}：</span>
                <span>{item.value}</span>
              </p>
            ))
          : null}
      </div>
    );
  }

  if (unit.sectionKey === "education") {
    const items = draftJson.education?.items ?? [];

    if (items.length === 0) {
      return null;
    }

    return (
      <div className="space-y-1">
        {items.map((item, index) => (
          <div key={item.id || `education-preview-${index}`} className="space-y-0.5">
            <div data-preview-break="true" className={`${renderStyles.titleText} grid grid-cols-4 items-center gap-3`}>
              <p className="min-w-0 text-left">{item.school || "—"}</p>
              <p className="min-w-0 text-center">{item.major || "—"}</p>
              <p className="min-w-0 text-center">{item.degree || "—"}</p>
              <p className="min-w-0 text-right">{formatDateRange(item.start_date, item.end_date) || "—"}</p>
            </div>
            <div className={`${renderStyles.list} space-y-0.5`}>
              {(item.courses ?? []).length > 0 ? (
                <p data-preview-break="true">
                  <span className={renderStyles.labelText}>课程：</span>
                  {item.courses.join("、")}
                  {item.gpa || item.ranking ? (
                    <span>
                      {" "}「
                      {item.gpa ? <><span className={renderStyles.labelText}>GPA：</span>{item.gpa}</> : null}
                      {item.gpa && item.ranking ? <span> | </span> : null}
                      {item.ranking ? <><span className={renderStyles.labelText}>排名：</span>{item.ranking}</> : null}
                      」
                    </span>
                  ) : null}
                </p>
              ) : null}
              {(item.honors ?? []).length > 0 ? (
                <p data-preview-break="true">
                  <span className={renderStyles.labelText}>荣誉：</span>
                  {(item.honors ?? []).join("、")}
                </p>
              ) : null}
              {!((item.courses ?? []).length > 0) && (item.gpa || item.ranking) ? (
                <p data-preview-break="true">
                  {item.gpa ? <><span className={renderStyles.labelText}>GPA：</span>{item.gpa}</> : null}
                  {item.gpa && item.ranking ? <span> | </span> : null}
                  {item.ranking ? <><span className={renderStyles.labelText}>排名：</span>{item.ranking}</> : null}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (unit.sectionKey === "internships" && unit.itemIndex !== null) {
    const item = draftJson.internships.items[unit.itemIndex];

    if (!item) {
      return null;
    }

    return (
      <div className="space-y-1">
        <div data-preview-break="true" className="grid grid-cols-[minmax(0,1fr)_minmax(90px,0.7fr)_auto] items-center gap-4">
          <p className={`${renderStyles.titleText} min-w-0 text-left`}>
            {item.company}
          </p>
          {item.role ? (
            <p className={`${renderStyles.titleText} text-center`}>
              {item.role}
            </p>
          ) : (
            <span />
          )}
          <p className={`${renderStyles.titleText} min-w-0 text-right`}>
            {formatDateRange(item.start_date, item.end_date) || "—"}
          </p>
        </div>
        <ul className={renderStyles.list}>
          {(item.bullets ?? []).map((bullet) => (
            <li key={bullet.id} data-preview-break="true">
              {bullet.label ? <span className={renderStyles.labelText}>{bullet.label}：</span> : null}
              <span>{bullet.content}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (unit.sectionKey === "projects" && unit.itemIndex !== null) {
    const item = draftJson.projects.items[unit.itemIndex];

    if (!item) {
      return null;
    }

    return (
      <div className="space-y-1">
        <div data-preview-break="true" className="grid grid-cols-[minmax(0,1fr)_minmax(90px,0.7fr)_auto] items-center gap-4">
          <p className={`${renderStyles.titleText} min-w-0 text-left`}>
            {item.name}
          </p>
          {item.role ? (
            <p className={`${renderStyles.titleText} text-center`}>
              {item.role}
            </p>
          ) : (
            <span />
          )}
          <p className={`${renderStyles.titleText} min-w-0 text-right`}>
            {formatDateRange(item.start_date, item.end_date) || "—"}
          </p>
        </div>
        <ul className={renderStyles.list}>
          {(item.bullets ?? []).map((bullet) => (
            <li key={bullet.id} data-preview-break="true">
              {bullet.label ? <span className={renderStyles.labelText}>{bullet.label}：</span> : null}
              <span>{bullet.content}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (unit.sectionKey === "other_experiences" && unit.itemIndex !== null) {
    const item = draftJson.other_experiences.items[unit.itemIndex];

    if (!item) {
      return null;
    }

    return (
      <div className="space-y-1">
        <div data-preview-break="true" className="grid grid-cols-[minmax(0,1fr)_minmax(90px,0.7fr)_auto] items-center gap-4">
          <p className={`${renderStyles.titleText} min-w-0 text-left`}>
            {[item.name, item.type].filter(Boolean).join(" | ")}
          </p>
          {item.role ? (
            <p className={`${renderStyles.titleText} text-center`}>
              {item.role}
            </p>
          ) : (
            <span />
          )}
          <p className={`${renderStyles.titleText} min-w-0 text-right`}>
            {formatDateRange(item.start_date, item.end_date) || "—"}
          </p>
        </div>
        <ul className={renderStyles.list}>
          {(item.bullets ?? []).map((bullet) => (
            <li key={bullet.id} data-preview-break="true">
              {bullet.label ? <span className={renderStyles.labelText}>{bullet.label}：</span> : null}
              <span>{bullet.content}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (unit.sectionKey === "skills") {
    const visibleItems = (draftJson.skills?.items ?? []).filter(
      (item) => item.label.trim() || item.content.trim(),
    );

    if (visibleItems.length === 0) {
      return null;
    }

    return (
      <div className={renderStyles.basicInfoStack}>
        {visibleItems.map((item, index) => (
          <p key={`${item.label}-${index}`} data-preview-break="true" className={renderStyles.bodyText}>
            {item.label ? <span className={renderStyles.labelText}>{item.label}：</span> : null}
            <span>{item.content}</span>
          </p>
        ))}
      </div>
    );
  }

  if (unit.sectionKey === "personal_advantages") {
    const visibleItems = (draftJson.personal_advantages?.items ?? [])
      .map((item) => item.content.trim())
      .filter(Boolean);

    if (visibleItems.length === 0) {
      return null;
    }

    return (
      <div className={renderStyles.basicInfoStack}>
        {visibleItems.map((item, index) => (
          <p key={`personal-advantage-${index}`} data-preview-break="true" className={renderStyles.bodyText}>
            {item}
          </p>
        ))}
      </div>
    );
  }

  return null;
}

function normalizeOptimizedTarget(unit: ConfirmationUnit, optimizedItem: BranchEditableTarget): BranchEditableTarget {
  if (unit.sectionKey === "basic_info") {
    const value = optimizedItem as Partial<DraftJson["basic_info"]>;
    return {
      status: typeof value.status === "string" ? value.status : "pending",
      items: Array.isArray(value.items) ? value.items : [],
    };
  }

  if (unit.sectionKey === "skills") {
    const value = optimizedItem as Partial<DraftJson["skills"]>;
    return {
      status: typeof value.status === "string" ? value.status : "pending",
      items: Array.isArray(value.items) ? value.items : [],
    };
  }

  if (unit.sectionKey === "personal_advantages") {
    const value = optimizedItem as Partial<DraftJson["personal_advantages"]>;
    return {
      status: typeof value.status === "string" ? value.status : "pending",
      items: Array.isArray(value.items) ? value.items : [],
    };
  }

  if (unit.sectionKey === "education") {
    const value = optimizedItem as Partial<DraftJson["education"]>;
    return {
      status: typeof value.status === "string" ? value.status : "pending",
      items: Array.isArray(value.items)
        ? value.items.map((item) => ({
            ...item,
            courses: Array.isArray(item.courses) ? item.courses : [],
            honors: Array.isArray(item.honors) ? item.honors : [],
          }))
        : [],
    };
  }

  if (unit.sectionKey === "internships") {
    const value = optimizedItem as DraftJsonInternshipItem;
    return {
      ...value,
      bullets: Array.isArray(value.bullets) ? value.bullets : [],
    };
  }

  if (unit.sectionKey === "projects") {
    const value = optimizedItem as DraftJsonProjectItem;
    return {
      ...value,
      bullets: Array.isArray(value.bullets) ? value.bullets : [],
    };
  }

  const value = optimizedItem as DraftJsonOtherExperienceItem;
  return {
    ...value,
    bullets: Array.isArray(value.bullets) ? value.bullets : [],
  };
}

function applyOptimizedItemToDraftJson(
  draftJson: DraftJson,
  unit: ConfirmationUnit,
  optimizedItem: BranchEditableTarget,
) {
  const normalizedItem = normalizeOptimizedTarget(unit, optimizedItem);

  if (unit.sectionKey === "basic_info") {
    return {
      ...draftJson,
      basic_info: normalizedItem as DraftJson["basic_info"],
    };
  }

  if (unit.sectionKey === "skills") {
    return {
      ...draftJson,
      skills: normalizedItem as DraftJson["skills"],
    };
  }

  if (unit.sectionKey === "personal_advantages") {
    return {
      ...draftJson,
      personal_advantages: normalizedItem as DraftJson["personal_advantages"],
    };
  }

  if (unit.sectionKey === "education") {
    return {
      ...draftJson,
      education: normalizedItem as DraftJson["education"],
    };
  }

  if (unit.itemIndex === null || !isOptimizableSection(unit.sectionKey)) {
    return draftJson;
  }

  if (unit.sectionKey === "internships") {
    return {
      ...draftJson,
      internships: {
        ...draftJson.internships,
        items: draftJson.internships.items.map((item, index) =>
          index === unit.itemIndex ? (normalizedItem as DraftJsonInternshipItem) : item,
        ),
      },
    };
  }

  if (unit.sectionKey === "projects") {
    return {
      ...draftJson,
      projects: {
        ...draftJson.projects,
        items: draftJson.projects.items.map((item, index) =>
          index === unit.itemIndex ? (normalizedItem as DraftJsonProjectItem) : item,
        ),
      },
    };
  }

  return {
    ...draftJson,
    other_experiences: {
      ...draftJson.other_experiences,
      items: draftJson.other_experiences.items.map((item, index) =>
        index === unit.itemIndex ? (normalizedItem as DraftJsonOtherExperienceItem) : item,
      ),
    },
  };
}

function getOptimizableItemFromDraftJson(draftJson: DraftJson, unit: ConfirmationUnit) {
  if (unit.sectionKey === "basic_info") {
    return draftJson.basic_info;
  }

  if (unit.sectionKey === "skills") {
    return draftJson.skills;
  }

  if (unit.sectionKey === "personal_advantages") {
    return draftJson.personal_advantages;
  }

  if (unit.sectionKey === "education") {
    return draftJson.education;
  }

  if (unit.itemIndex === null || !isOptimizableSection(unit.sectionKey)) {
    return null;
  }

  if (unit.sectionKey === "internships") {
    return draftJson.internships.items[unit.itemIndex] ?? null;
  }

  if (unit.sectionKey === "projects") {
    return draftJson.projects.items[unit.itemIndex] ?? null;
  }

  return draftJson.other_experiences.items[unit.itemIndex] ?? null;
}

function EditPencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12.85 4.65a1.2 1.2 0 0 1 1.7 0l.8.8a1.2 1.2 0 0 1 0 1.7L8.15 14.35 5 15l.65-3.15L12.85 4.65Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.75 5.75 14.25 8.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ContinueEditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12.85 4.65a1.2 1.2 0 0 1 1.7 0l.8.8a1.2 1.2 0 0 1 0 1.7L8.15 14.35 5 15l.65-3.15L12.85 4.65Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.75 10h4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m6.5 7.75 1.75 2.25L6.5 12.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M6 4v8m0 0 3-3m-3 3 3 3m0-9h5v10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12.5 4.5 7 10l5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <circle cx="7" cy="5" r="1.2" fill="currentColor" />
      <circle cx="13" cy="5" r="1.2" fill="currentColor" />
      <circle cx="7" cy="10" r="1.2" fill="currentColor" />
      <circle cx="13" cy="10" r="1.2" fill="currentColor" />
      <circle cx="7" cy="15" r="1.2" fill="currentColor" />
      <circle cx="13" cy="15" r="1.2" fill="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M6.5 4.75H13.5M8 4.75V3.75C8 3.336 8.336 3 8.75 3H11.25C11.664 3 12 3.336 12 3.75V4.75M5.75 6.5L6.25 14.5C6.308 15.421 7.073 16.143 8 16.143H12C12.927 16.143 13.692 15.421 13.75 14.5L14.25 6.5M8.75 8.5V13M11.25 8.5V13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon({ open = false }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path
        d="m5.5 7.5 4.5 4.5 4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HomePage() {
  const resumeFileInputRef = useRef<HTMLInputElement | null>(null);
  const jdImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const branchScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const branchInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previewPaperRef = useRef<HTMLDivElement | null>(null);
  const previewMeasureRef = useRef<HTMLDivElement | null>(null);
  const previewContentRef = useRef<HTMLDivElement | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewToolbarRef = useRef<HTMLDivElement | null>(null);
  const previewPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const imageExportPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const printPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const overviewCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const branchGapCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const branchGapSelectorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previewCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const bossGreetingAssetRef = useRef<GeneratedAssetState>({
    status: "idle",
    content: "",
    error: "",
    requestKey: "",
  });
  const coverLetterAssetRef = useRef<GeneratedAssetState>({
    status: "idle",
    content: "",
    error: "",
    requestKey: "",
  });
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(PREVIEW_MIN_ZOOM);
  const lastPreviewTapRef = useRef(0);
  const [viewMode, setViewMode] = useState<ViewMode>("user");
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<Step>(1);
  const [optimizedResumeText, setOptimizedResumeText] = useState("");
  const [hiddenGenerationStatus, setHiddenGenerationStatus] = useState<HiddenGenerationStatus>("idle");
  const [waitingStepNextRequested, setWaitingStepNextRequested] = useState(false);
  const [selectedCoverLetterTemplateId, setSelectedCoverLetterTemplateId] = useState<string | null>(
    COVER_LETTER_TEMPLATE_PLACEHOLDERS[0]?.id ?? null,
  );
  const [selectedGreetingTemplateId, setSelectedGreetingTemplateId] = useState<string | null>(
    GREETING_TEMPLATE_PLACEHOLDERS[0]?.id ?? null,
  );
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [generatedResultPreviewKind, setGeneratedResultPreviewKind] = useState<GeneratedResultPreviewKind | null>(null);
  const [workflowTargetRole, setWorkflowTargetRole] = useState("");
  const [workflowInternshipDuration, setWorkflowInternshipDuration] = useState<WorkflowInternshipDuration>("");
  const [workflowCompanyName, setWorkflowCompanyName] = useState("");
  const [bossGreetingAsset, setBossGreetingAsset] = useState<GeneratedAssetState>({
    status: "idle",
    content: "",
    error: "",
    requestKey: "",
  });
  const [coverLetterAsset, setCoverLetterAsset] = useState<GeneratedAssetState>({
    status: "idle",
    content: "",
    error: "",
    requestKey: "",
  });
  const [draftResumeJson, setDraftResumeJson] = useState("");
  const [globalGapAnalysisResult, setGlobalGapAnalysisResult] = useState("");
  const [globalGapAnalysisData, setGlobalGapAnalysisData] = useState<GlobalGapAnalysisSuccess | null>(null);
  const [debugMemoryWriterResults, setDebugMemoryWriterResults] = useState<DebugMemoryWriterResultItem[]>([]);
  const [debugOptimizeResults, setDebugOptimizeResults] = useState<DebugOptimizeResultItem[]>([]);
  const [error, setError] = useState("");
  const [parsingResume, setParsingResume] = useState(false);
  const [importingResumePdf, setImportingResumePdf] = useState(false);
  const [importingJdImage, setImportingJdImage] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingDraftJson, setGeneratingDraftJson] = useState(false);
  const [parsedResumeJson, setParsedResumeJson] = useState("");
  const [parsedJdJson, setParsedJdJson] = useState("");
  const [draftJsonState, setDraftJsonState] = useState<DraftJson | null>(null);
  const [confirmationQueue, setConfirmationQueue] = useState<ConfirmationUnit[]>([]);
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
  const [acceptedUnits, setAcceptedUnits] = useState<Record<string, boolean>>({});
  const [removedUnits, setRemovedUnits] = useState<Record<string, boolean>>({});
  const [recentlyAdoptedUnitId, setRecentlyAdoptedUnitId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem(BOSS_GREETING_STORAGE_KEY);
    if (!storedValue) {
      return;
    }

    try {
      const parsed = JSON.parse(storedValue) as GeneratedAssetState;
      if (parsed && typeof parsed.content === "string" && parsed.content.trim()) {
        setBossGreetingAsset(parsed);
      }
    } catch {
      window.localStorage.removeItem(BOSS_GREETING_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem(COVER_LETTER_STORAGE_KEY);
    if (!storedValue) {
      return;
    }

    try {
      const parsed = JSON.parse(storedValue) as GeneratedAssetState;
      if (parsed && typeof parsed.content === "string" && parsed.content.trim()) {
        setCoverLetterAsset(parsed);
      }
    } catch {
      window.localStorage.removeItem(COVER_LETTER_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (bossGreetingAsset.status === "success" && bossGreetingAsset.content.trim()) {
      window.localStorage.setItem(BOSS_GREETING_STORAGE_KEY, JSON.stringify(bossGreetingAsset));
      return;
    }

    if (bossGreetingAsset.status === "idle" && !bossGreetingAsset.content.trim()) {
      window.localStorage.removeItem(BOSS_GREETING_STORAGE_KEY);
    }
  }, [bossGreetingAsset]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (coverLetterAsset.status === "success" && coverLetterAsset.content.trim()) {
      window.localStorage.setItem(COVER_LETTER_STORAGE_KEY, JSON.stringify(coverLetterAsset));
      return;
    }

    if (coverLetterAsset.status === "idle" && !coverLetterAsset.content.trim()) {
      window.localStorage.removeItem(COVER_LETTER_STORAGE_KEY);
    }
  }, [coverLetterAsset]);

  useEffect(() => {
    bossGreetingAssetRef.current = bossGreetingAsset;
  }, [bossGreetingAsset]);

  useEffect(() => {
    coverLetterAssetRef.current = coverLetterAsset;
  }, [coverLetterAsset]);
  const [pendingOptimizations, setPendingOptimizations] = useState<Record<string, BranchEditableTarget>>({});
  const [branchUnitId, setBranchUnitId] = useState<string | null>(null);
  const [branchMessageHistory, setBranchMessageHistory] = useState<Record<string, ChatMessage[]>>({});
  const [branchRounds, setBranchRounds] = useState<Record<string, number>>({});
  const [branchExpandedRounds, setBranchExpandedRounds] = useState<Record<string, Record<number, boolean>>>({});
  const [branchSourceVersions, setBranchSourceVersions] = useState<Record<string, BranchEditableTarget>>({});
  const [branchMemories, setBranchMemories] = useState<Record<string, BranchMemory>>({});
  const [branchSandboxStates, setBranchSandboxStates] = useState<Record<string, BranchSandboxState>>({});
  const [branchPlanningStates, setBranchPlanningStates] = useState<Record<string, BranchPlanningState>>({});
  const [branchGapFormState, setBranchGapFormState] = useState<BranchGapFormState>({
    assignments: {},
    submitting: false,
    completed: false,
  });
  const [branchInput, setBranchInput] = useState("");
  const [branchInputPlaceholder, setBranchInputPlaceholder] = useState(
    "请描述修改要求；支持整段优化或单条 bullet 修改。",
  );
  const [branchActiveQuickActionLabel, setBranchActiveQuickActionLabel] = useState<string | null>(null);
  const [branchOptimizing, setBranchOptimizing] = useState(false);
  const [activeOverviewSortMenuUnitId, setActiveOverviewSortMenuUnitId] = useState<string | null>(null);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [previewPageHeightPx, setPreviewPageHeightPx] = useState(0);
  const [previewPageBodyHeightPx, setPreviewPageBodyHeightPx] = useState(0);
  const [previewPageOffsetsPx, setPreviewPageOffsetsPx] = useState<number[]>([0]);
  const [previewContentHeightPx, setPreviewContentHeightPx] = useState(0);
  const [previewMeasuredBlocks, setPreviewMeasuredBlocks] = useState<MeasuredBlock[]>([]);
  const [previewPages, setPreviewPages] = useState<ResumePage[]>([]);
  const [isPreviewOverflowModalOpen, setIsPreviewOverflowModalOpen] = useState(false);
  const [previewOverflowDismissedSignature, setPreviewOverflowDismissedSignature] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(PREVIEW_MIN_ZOOM);
  const [previewDisplayScale, setPreviewDisplayScale] = useState(1);
  const [isPreviewToolbarExpanded, setIsPreviewToolbarExpanded] = useState(false);
  const [activePreviewSlider, setActivePreviewSlider] = useState<PreviewSliderKey | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [isExportingImages, setIsExportingImages] = useState(false);
  const [isExportingBundle, setIsExportingBundle] = useState(false);
  const [uploadedResumeFileName, setUploadedResumeFileName] = useState("");
  const [uploadedJdImageFileName, setUploadedJdImageFileName] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [isJdImageDragActive, setIsJdImageDragActive] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<PreviewSettings>(PREVIEW_DEFAULT_SETTINGS);
  const [resumeValidationAttempted, setResumeValidationAttempted] = useState(false);
  const stepOneAutoScrollKeyRef = useRef<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<CollapsibleSectionKey, boolean>>({
    internships: true,
    projects: true,
    otherExperiences: true,
    skills: true,
    selfSummary: true,
  });
  const [collapsedSkillCategories, setCollapsedSkillCategories] = useState<Record<SkillCategoryKey, boolean>>({
    officeTools: true,
    dataTools: true,
    designTools: true,
    contentTools: true,
    aiTools: true,
    languageSkills: true,
    certifications: true,
  });

  const [skillDraftInputs, setSkillDraftInputs] = useState<Record<SkillCategoryKey, string>>({
    officeTools: "",
    dataTools: "",
    designTools: "",
    contentTools: "",
    aiTools: "",
    languageSkills: "",
    certifications: "",
  });

  useEffect(() => {
    const hasOpenSelector = Object.values(branchGapFormState.assignments).some((assignment) => assignment.selectorOpen);

    if (!hasOpenSelector || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      const clickedInsideSelector = Object.values(branchGapSelectorRefs.current).some(
        (node) => node && node.contains(target),
      );

      if (clickedInsideSelector) {
        return;
      }

      setBranchGapFormState((prev) => ({
        ...prev,
        assignments: Object.fromEntries(
          Object.entries(prev.assignments).map(([gapId, assignment]) => [
            gapId,
            assignment.selectorOpen
              ? {
                  ...assignment,
                  selectorOpen: false,
                }
              : assignment,
          ]),
        ) as Record<string, BranchGapAssignmentItemState>,
      }));
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [branchGapFormState.assignments]);
  const [resumeForm, setResumeForm] = useState<ResumeFormState>({
    basicInfo: {
      name: "",
      phone: "",
      email: "",
      targetRole: "",
      portfolio: "",
      github: "",
      politicalStatus: "",
    },
    education: [createEducationItem()],
    internships: [createExperienceItem()],
    projects: [createProjectItem()],
    otherExperiences: [createOtherExperienceItem()],
    skills: {
      officeTools: [],
      dataTools: [],
      designTools: [],
      contentTools: [],
      aiTools: [],
      languageSkills: [],
      certifications: [],
    },
    selfSummary: "",
  });

  const updateBasicInfo = (field: keyof BasicInfoForm, value: string) => {
    setResumeForm((prev) => ({
      ...prev,
      basicInfo: {
        ...prev.basicInfo,
        [field]: value,
      },
    }));
  };

  const updateArrayItem = <T,>(key: "education" | "internships" | "projects" | "otherExperiences", index: number, updater: (item: T) => T) => {
    setResumeForm((prev) => ({
      ...prev,
      [key]: (prev[key] as T[]).map((item, itemIndex) => (itemIndex === index ? updater(item) : item)),
    }));
  };

  const updateStringListField = (sectionKey: "education" | "education-honors", itemIndex: number, listIndex: number, value: string) => {
    if (sectionKey === "education") {
      updateArrayItem<EducationFormItem>("education", itemIndex, (item) => ({
        ...item,
        courses: item.courses.map((course, index) => (index === listIndex ? value : course)),
      }));
      return;
    }

    if (sectionKey === "education-honors") {
      updateArrayItem<EducationFormItem>("education", itemIndex, (item) => ({
        ...item,
        honors: item.honors.map((honor, index) => (index === listIndex ? value : honor)),
      }));
    }
  };

  const isJdImageFile = (file: File) =>
    ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type) ||
    /\.(png|jpe?g|webp)$/i.test(file.name);

  const scrollStepOneToBottom = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    if (currentStep !== 1) {
      return;
    }

    if (!uploadedResumeFileName || !uploadedJdImageFileName) {
      return;
    }

    const nextKey = `${uploadedResumeFileName}::${uploadedJdImageFileName}`;

    if (stepOneAutoScrollKeyRef.current === nextKey) {
      return;
    }

    stepOneAutoScrollKeyRef.current = nextKey;
    scrollStepOneToBottom();
  }, [currentStep, uploadedResumeFileName, uploadedJdImageFileName, scrollStepOneToBottom]);

  const handleResumeFile = useCallback(async (file: File) => {
    if (!file) {
      return;
    }

    if (!isPdfFile(file)) {
      setError("请上传 PDF 文件");
      return;
    }

    setUploadedResumeFileName(file.name);
    setImportingResumePdf(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const extractResponse = await fetch("/api/extract-resume-pdf", {
        method: "POST",
        body: formData,
      });

      const extractData = await parseApiJson<ResumePdfExtractResponse>(extractResponse);

      if (!extractResponse.ok) {
        throw new Error("error" in extractData ? extractData.error : "PDF 文本提取失败");
      }

      if (!("resumeText" in extractData) || !extractData.resumeText.trim()) {
        throw new Error("PDF 中没有提取到可用文本");
      }

      const parseResponse = await fetch("/api/parse-resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeText: extractData.resumeText,
        }),
      });

      const parseData = await parseApiJson<ResumeParseResponse>(parseResponse);

      if (!parseResponse.ok) {
        throw new Error("error" in parseData ? parseData.error : "简历解析失败");
      }

      if (!("resumeJson" in parseData)) {
        throw new Error("简历解析返回格式不正确");
      }

      setParsedResumeJson(JSON.stringify(parseData.resumeJson, null, 2));
      const nextForm = mapResumeJsonToFormState(parseData.resumeJson as ParsedResumeJson);
      setResumeForm(nextForm);
      setCollapsedSections(buildCollapsedSectionsFromForm(nextForm));
      setCollapsedSkillCategories(buildCollapsedSkillCategoriesFromForm(nextForm));
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF 解析失败");
    } finally {
      setImportingResumePdf(false);
    }
  }, []);

  const handleJdImageFile = useCallback(async (file: File) => {
    if (!file) {
      return;
    }

    if (!isJdImageFile(file)) {
      setError("请上传 PNG、JPG、JPEG 或 WEBP 格式的 JD 截图。");
      return;
    }

    setUploadedJdImageFileName(file.name);
    setIsJdImageDragActive(false);
    setImportingJdImage(true);
    setParsedJdJson("");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract-jd-image", {
        method: "POST",
        body: formData,
      });

      const data = await parseApiJson<JdImageExtractResponse>(response);

      if (!response.ok) {
        throw new Error("error" in data ? data.error : "JD 图片识别失败");
      }

      if (!("jdJson" in data)) {
        throw new Error("JD 图片识别返回格式不正确");
      }

      setParsedJdJson(JSON.stringify(data.jdJson, null, 2));
    } catch (error) {
      setParsedJdJson("");
      setError(error instanceof Error ? error.message : "JD 图片识别失败");
    } finally {
      setImportingJdImage(false);
    }
  }, []);

  const handleJdImageFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleJdImageFile(file);
    }
    event.target.value = "";
  };

  const handleJdImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsJdImageDragActive(false);

    if (importingJdImage) {
      return;
    }

    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleJdImageFile(file);
    }
  };

  const handleResumeFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await handleResumeFile(file);
    event.target.value = "";
  };

  const handleResumeDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);

    if (importingResumePdf) {
      return;
    }

    const file = getDroppedFile(event.dataTransfer);
    if (!file) {
      return;
    }

    await handleResumeFile(file);
  };

  const openResumeFilePicker = useCallback(() => {
    if (importingResumePdf) {
      return;
    }

    resumeFileInputRef.current?.click();
  }, [importingResumePdf]);

  const openJdImageFilePicker = useCallback(() => {
    if (importingJdImage) {
      return;
    }

    jdImageFileInputRef.current?.click();
  }, [importingJdImage]);

  useEffect(() => {
    if (currentStep !== 1) {
      return;
    }

    const activateDrag = (event: globalThis.DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return false;
      }

      const file = getDroppedFile(event.dataTransfer);
      if (!file || !isPdfFile(file)) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      if (!importingResumePdf) {
        setIsDragActive(true);
      }
      return true;
    };

    const handleWindowDragEnter = (event: globalThis.DragEvent) => {
      activateDrag(event);
    };

    const handleWindowDragOver = (event: globalThis.DragEvent) => {
      if (!activateDrag(event)) {
        return;
      }

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const handleWindowDragLeave = (event: globalThis.DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }

      const file = getDroppedFile(event.dataTransfer);
      if (!file || !isPdfFile(file)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (event.relatedTarget === null) {
        setIsDragActive(false);
      }
    };

    const handleWindowDrop = (event: globalThis.DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) {
        return;
      }

      const file = getDroppedFile(event.dataTransfer);
      if (!file || !isPdfFile(file)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);

      if (importingResumePdf) {
        return;
      }

      void handleResumeFile(file);
    };

    window.addEventListener("dragenter", handleWindowDragEnter, true);
    window.addEventListener("dragover", handleWindowDragOver, true);
    window.addEventListener("dragleave", handleWindowDragLeave, true);
    window.addEventListener("drop", handleWindowDrop, true);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter, true);
      window.removeEventListener("dragover", handleWindowDragOver, true);
      window.removeEventListener("dragleave", handleWindowDragLeave, true);
      window.removeEventListener("drop", handleWindowDrop, true);
    };
  }, [currentStep, importingResumePdf, handleResumeFile]);

  const toggleSkill = (category: keyof SkillsForm, value: string) => {
    setResumeForm((prev) => {
      const currentValues = prev.skills[category];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return {
        ...prev,
        skills: {
          ...prev.skills,
          [category]: nextValues,
        },
      };
    });
  };

  const updateSkillDraftInput = (category: SkillCategoryKey, value: string) => {
    setSkillDraftInputs((prev) => ({
      ...prev,
      [category]: value,
    }));
  };

  const addCustomSkill = (category: SkillCategoryKey) => {
    const nextValue = skillDraftInputs[category].trim();

    if (!nextValue) {
      return;
    }

    setResumeForm((prev) => {
      const currentValues = prev.skills[category];
      if (currentValues.includes(nextValue)) {
        return prev;
      }

      return {
        ...prev,
        skills: {
          ...prev.skills,
          [category]: [...currentValues, nextValue],
        },
      };
    });

    setSkillDraftInputs((prev) => ({
      ...prev,
      [category]: "",
    }));
  };

  const toggleSectionCollapse = (sectionKey: CollapsibleSectionKey) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const toggleSkillCategoryCollapse = (category: SkillCategoryKey) => {
    setCollapsedSkillCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const getInputClassName = (invalid = false, area: "default" | "dark" = "default") =>
    `rounded-2xl border px-4 py-3 text-slate-900 outline-none transition focus:ring-2 ${
      area === "dark" ? "bg-white/92" : "bg-white"
    } ${
      invalid
        ? "border-rose-400 bg-rose-400/5 focus:border-rose-300 focus:ring-rose-400/20"
        : "border-slate-300 focus:border-blue-500 focus:ring-blue-500/20"
    }`;

  const visibleSteps: Step[] = [1, 3, 4, 6, 7];

  const isStepReached = (step: Step) => {
    return maxReachedStep >= step;
  };

  const getVisibleStepNumber = (step: Step) => visibleSteps.indexOf(step) + 1;

  const parseResume = async () => {
    const resumeJson = buildResumeJsonFromForm(resumeForm);
    setParsedResumeJson(JSON.stringify(resumeJson, null, 2));
    return resumeJson;
  };

  const generateResumeText = async (resumeJson: unknown, jdJson: unknown) => {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        resume: resumeJson,
        jd: jdJson,
      }),
    });

    const data = await parseApiJson<GenerateResponse>(response);

    if (!response.ok) {
      throw new Error("error" in data ? data.error : "文本简历生成失败");
    }

    if (!("result" in data)) {
      throw new Error("文本简历返回格式不正确");
    }

    return data.result;
  };

  const generateDraftJson = async (textResume: string) => {
    const draftResponse = await fetch("/api/generate-draft-json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        optimizedResumeText: textResume,
      }),
    });

    const draftData = await parseApiJson<DraftJsonResponse>(draftResponse);

    if (!draftResponse.ok) {
      throw new Error("error" in draftData ? draftData.error : "Draft JSON 生成失败");
    }

    if (!("draftResumeJson" in draftData)) {
      throw new Error("Draft JSON 返回格式不正确");
    }

    return JSON.stringify(draftData.draftResumeJson, null, 2);
  };

  const generateGlobalGapAnalysis = async (draftJsonText: string, jdJson: unknown) => {
    let parsedDraftJson: DraftJson;

    try {
      parsedDraftJson = JSON.parse(draftJsonText) as DraftJson;
    } catch {
      throw new Error("Draft JSON 解析失败，暂时无法执行 Gap 分析");
    }

    const versionId = `draft-${Date.now()}`;
    const response = await fetch("/api/branch-gap-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetJobTitle: workflowTargetRole.trim(),
        targetJdJson: jdJson,
        experienceDraftPool: {
          internships: parsedDraftJson.internships.items,
          projects: parsedDraftJson.projects.items,
          other_experiences: parsedDraftJson.other_experiences.items,
        },
        resumeRules: OPTIMIZE_REWRITE_RULES,
        versionId,
      }),
    });

    const data = await parseApiJson<GlobalGapAnalysisResponse>(response);

    if (!response.ok) {
      throw new Error("error" in data ? data.error : "Gap 分析失败");
    }

    if (!("gaps" in data)) {
      throw new Error("Gap 分析返回格式不正确");
    }

    return data;
  };

  const generateBossGreeting = async (
    jdJson: unknown,
    draftJson: unknown,
    workflowContext: {
      jobTitle: string;
      internshipDuration: WorkflowInternshipDuration;
      companyName: string;
      systemPrompt: string;
    },
  ) => {
    const response = await fetch("/api/generate-boss-greeting", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jdJson,
        draftJson,
        jobTitle: workflowContext.jobTitle,
        internshipDuration: workflowContext.internshipDuration,
        companyName: workflowContext.companyName,
        systemPrompt: workflowContext.systemPrompt,
      }),
    });

    const data = await parseApiJson<BossGreetingResponse>(response);

    if (!response.ok) {
      throw new Error("error" in data ? data.error : "Boss 打招呼语生成失败");
    }

    if (!("result" in data) || !data.result.trim()) {
      throw new Error("Boss 打招呼语返回格式不正确");
    }

    return data.result.trim();
  };

  const generateCoverLetter = async (
    jdJson: unknown,
    draftJson: unknown,
    workflowContext: {
      jobTitle: string;
      internshipDuration: WorkflowInternshipDuration;
      companyName: string;
      systemPrompt: string;
    },
  ) => {
    const response = await fetch("/api/generate-cover-letter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jdJson,
        draftJson,
        jobTitle: workflowContext.jobTitle,
        internshipDuration: workflowContext.internshipDuration,
        companyName: workflowContext.companyName,
        systemPrompt: workflowContext.systemPrompt,
      }),
    });

    const data = await parseApiJson<CoverLetterResponse>(response);

    if (!response.ok) {
      throw new Error("error" in data ? data.error : "邮件求职信生成失败");
    }

    if (!("result" in data) || !data.result.trim()) {
      throw new Error("邮件求职信返回格式不正确");
    }

    return data.result.trim();
  };

  const prepareConfirmationStateFromDraftJson = (draftJsonText: string) => {
    setDraftResumeJson(draftJsonText);

    try {
      const parsedDraftJson = JSON.parse(draftJsonText) as DraftJson;
      const queue = buildConfirmationQueue(parsedDraftJson);
      const defaultAcceptedUnits = queue.reduce<Record<string, boolean>>((acc, unit) => {
        if (unit.sectionKey === "basic_info" || unit.sectionKey === "education") {
          acc[unit.id] = true;
        }
        return acc;
      }, {});

      setDraftJsonState(parsedDraftJson);
      setConfirmationQueue(queue);
      setCurrentUnitIndex(0);
      setAcceptedUnits(defaultAcceptedUnits);
      setRemovedUnits({});
      setRecentlyAdoptedUnitId(null);
      setPendingOptimizations({});
      setBranchUnitId(null);
      setBranchMessageHistory({});
      setBranchRounds({});
      setBranchExpandedRounds({});
      setBranchSourceVersions({});
      setBranchGapFormState({
        assignments: {},
        submitting: false,
        completed: false,
      });
      setBranchInput("");
    } catch {
      throw new Error("Draft JSON 解析失败，暂时无法进入左右分屏页面");
    }
  };

  const startHiddenGenerationPipeline = async (resumeJson: unknown, jdJson: unknown) => {
    setHiddenGenerationStatus("running");
    setGenerating(true);
    setGeneratingDraftJson(true);
    setError("");
    setOptimizedResumeText("");
    setDraftResumeJson("");
    setGlobalGapAnalysisResult("");
    setGlobalGapAnalysisData(null);
    setDebugMemoryWriterResults([]);
    setDebugOptimizeResults([]);
    setBranchGapFormState({
      assignments: {},
      submitting: false,
      completed: false,
    });
    setDraftJsonState(null);
    setConfirmationQueue([]);
    setAcceptedUnits({});
    setRemovedUnits({});

    try {
      const generatedResumeText = await generateResumeText(resumeJson, jdJson);
      setOptimizedResumeText(generatedResumeText);
      setGenerating(false);

      const draftJsonText = await generateDraftJson(generatedResumeText);
      const gapAnalysisData = await generateGlobalGapAnalysis(draftJsonText, jdJson);
      setGlobalGapAnalysisData(gapAnalysisData);
      setGlobalGapAnalysisResult(JSON.stringify(gapAnalysisData, null, 2));
      setBranchGapFormState(createBranchGapFormStateFromAnalysis(gapAnalysisData));
      prepareConfirmationStateFromDraftJson(draftJsonText);
      setHiddenGenerationStatus("success");
    } catch (err) {
      setHiddenGenerationStatus("error");
      throw err;
    } finally {
      setGenerating(false);
      setGeneratingDraftJson(false);
    }
  };

  const scrollToStepOneAnchor = useCallback((elementId: string) => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const target = document.getElementById(elementId);
      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const scrollToBranchGapCard = useCallback((gapId: string) => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const target = branchGapCardRefs.current[gapId];
      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const handleResumeNext = async () => {
    setResumeValidationAttempted(true);

    if (!resumeForm.basicInfo.name.trim() || !resumeForm.basicInfo.phone.trim() || !resumeForm.basicInfo.email.trim()) {
      setError("请先完整填写基础信息中的姓名、手机号和邮箱。");
      scrollToStepOneAnchor("intake-basicInfo");
      return;
    }

    if (!resumeForm.education.every(isEducationItemComplete)) {
      setCollapsedSections((prev) => ({
        ...prev,
        education: false,
      }));
      setError("请先完整填写所有带 * 的教育背景字段。");
      scrollToStepOneAnchor("intake-education");
      return;
    }

    if (!hasAtLeastOneExperience) {
      setCollapsedSections((prev) => ({
        ...prev,
        internships: false,
        projects: false,
        otherExperiences: false,
      }));
      setError("请至少完整填写 1 段实习经历、项目经历或其他经历中的带 * 字段。");
      scrollToStepOneAnchor("intake-internships");
      return;
    }

    if (!parsedJdJson.trim()) {
      setError("请先上传并完成岗位 JD 图片识别。");
      return;
    }

    setParsingResume(true);
    setError("");
    setOptimizedResumeText("");
    setDraftResumeJson("");
    setGlobalGapAnalysisResult("");
    setDebugMemoryWriterResults([]);
    setDebugOptimizeResults([]);
    setHiddenGenerationStatus("idle");
    setWaitingStepNextRequested(false);
    setBossGreetingAsset({
      status: "idle",
      content: "",
      error: "",
      requestKey: "",
    });
    setCoverLetterAsset({
      status: "idle",
      content: "",
      error: "",
      requestKey: "",
    });

    try {
      const resumeJson = await parseResume();
      const jdJson = parseStoredJsonOrThrow(parsedJdJson, "JD JSON");
      if (!workflowTargetRole.trim()) {
        setWorkflowTargetRole(resumeForm.basicInfo.targetRole.trim());
      }
      setResumeValidationAttempted(false);
      setCurrentStep(3);
      setMaxReachedStep(3);
      setParsingResume(false);
      await startHiddenGenerationPipeline(resumeJson, jdJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setParsingResume(false);
    }
  };

  const handleRegenerateResumeText = async () => {
    if (!parsedResumeJson.trim() || !parsedJdJson.trim()) {
      setError("缺少可用的简历 JSON 或 JD JSON，无法重新生成文本简历");
      return;
    }

    setGenerating(true);
    setError("");

    try {
      const resumeJson = parseStoredJsonOrThrow(parsedResumeJson, "简历 JSON");
      const jdJson = parseStoredJsonOrThrow(parsedJdJson, "JD JSON");
      const regeneratedResumeText = await generateResumeText(resumeJson, jdJson);
      setOptimizedResumeText(regeneratedResumeText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setGenerating(false);
    }
  };

  const handleTextResumeNext = async () => {
    setError("");

    if (!isWorkflowFormComplete) {
      setWaitingStepNextRequested(false);
      setError("请先完整填写上方 3 项必填信息后，再进入下一页。");
      return;
    }

    setWaitingStepNextRequested(true);

    if (hiddenGenerationStatus === "success") {
      setCurrentStep(4);
      setMaxReachedStep(4);
      setWaitingStepNextRequested(false);
      return;
    }

    if (hiddenGenerationStatus === "error") {
      setWaitingStepNextRequested(false);
      if (!error) {
        setError("后台生成尚未成功完成，请先处理当前错误。");
      }
    }
  };

  const markUnitAccepted = (unit: ConfirmationUnit) => {
    const currentIndex = confirmationQueue.findIndex((queueUnit) => queueUnit.id === unit.id);
    const nextIndex =
      currentIndex >= 0 && currentIndex < confirmationQueue.length - 1 ? currentIndex + 1 : Math.max(currentIndex, 0);

    setAcceptedUnits((prev) => ({
      ...prev,
      [unit.id]: true,
    }));
    setRemovedUnits((prev) => ({
      ...prev,
      [unit.id]: false,
    }));
    setCurrentUnitIndex(nextIndex);
  };

  const markUnitRemoved = (unit: ConfirmationUnit) => {
    const currentIndex = confirmationQueue.findIndex((queueUnit) => queueUnit.id === unit.id);
    const nextIndex =
      currentIndex >= 0 && currentIndex < confirmationQueue.length - 1 ? currentIndex + 1 : Math.max(currentIndex, 0);

    setAcceptedUnits((prev) => ({
      ...prev,
      [unit.id]: false,
    }));
    setRemovedUnits((prev) => ({
      ...prev,
      [unit.id]: true,
    }));
    setCurrentUnitIndex(nextIndex);
  };

  const handleAcceptSection = (targetUnit?: ConfirmationUnit) => {
    const currentUnit = targetUnit ?? confirmationQueue[currentUnitIndex];

    if (!draftJsonState || !currentUnit) {
      return;
    }

    if (acceptedUnits[currentUnit.id] && isRemovableSection(currentUnit.sectionKey)) {
      markUnitRemoved(currentUnit);
      return;
    }

    const pendingOptimizedItem = pendingOptimizations[currentUnit.id];

    if (pendingOptimizedItem) {
      handleAcceptOptimizedResult(currentUnit, pendingOptimizedItem);
    } else {
      markUnitAccepted(currentUnit);
    }

    setRecentlyAdoptedUnitId(currentUnit.id);
  };

  const handleOpenBranch = (targetUnit?: ConfirmationUnit) => {
    const currentUnit = targetUnit ?? confirmationQueue[currentUnitIndex];

    if (!currentUnit) {
      return;
    }

    setBranchUnitId(currentUnit.id);
    setBranchInput("");
    setBranchActiveQuickActionLabel(null);
    setBranchInputPlaceholder(
      isOptimizableSection(currentUnit.sectionKey)
        ? "请先完成这组差距补充，提交后会自动生成一版结果，再进入自定义修改。"
        : "请描述修改要求；支持整段优化或单条 bullet 修改。",
    );

    if (!draftJsonState) {
      return;
    }

    const currentVersion =
      pendingOptimizations[currentUnit.id] ?? getOptimizableItemFromDraftJson(draftJsonState, currentUnit);

    if (!currentVersion) {
      return;
    }

    setBranchSourceVersions((prev) => ({
      ...prev,
      [currentUnit.id]: currentVersion,
    }));

    if (isOptimizableSection(currentUnit.sectionKey)) {
      const existingMode = branchMemories[currentUnit.id]?.mode ?? "assistant-guided";
      const targetJd = parseJdJsonInput(parsedJdJson);
      setBranchMemories((prev) => ({
        ...prev,
        [currentUnit.id]: prev[currentUnit.id]
          ? {
              ...prev[currentUnit.id],
              mode: existingMode,
            }
          : {
              ...createInitialBranchMemory(currentVersion),
              mode: existingMode,
            },
      }));
      setBranchSandboxStates((prev) => ({
        ...prev,
        [currentUnit.id]:
          prev[currentUnit.id] ??
            createBranchSandboxState({
                unit: currentUnit,
                currentDraft: currentVersion,
                targetJd,
                targetJobTitle: workflowTargetRole,
              }),
      }));
    }

    const existingHistory = branchMessageHistory[currentUnit.id] ?? [];

    if (existingHistory.length === 0) {
      setBranchRounds((prev) => ({
        ...prev,
        [currentUnit.id]: 1,
      }));
      setBranchExpandedRounds((prev) => ({
        ...prev,
        [currentUnit.id]: {
          1: true,
        },
      }));
      const initialMessages = isOptimizableSection(currentUnit.sectionKey)
        ? [
            {
              id: `${currentUnit.id}-branch-current-1`,
              role: "ai" as const,
              unitId: currentUnit.id,
              text: "这是当前采用版本，你可以直接基于这一版继续修改。",
              type: "section" as const,
              versionItem: currentVersion,
            },
          ]
        : [
            {
              id: `${currentUnit.id}-branch-1`,
              role: "ai" as const,
              unitId: currentUnit.id,
              text: `这里是【${currentUnit.label}】的分支修改界面。你可以围绕这一段内容反复调整，左上角返回后会回到主确认流。`,
              type: "modify-placeholder" as const,
            },
            {
              id: `${currentUnit.id}-branch-current-1`,
              role: "ai" as const,
              unitId: currentUnit.id,
              text: "这是当前采用版本，你可以直接基于这一版继续修改。",
              type: "section" as const,
              versionItem: currentVersion,
            },
          ];
      setBranchMessageHistory((prev) => ({
        ...prev,
        [currentUnit.id]: initialMessages,
      }));
      return;
    }

    const nextRound = (branchRounds[currentUnit.id] ?? 1) + 1;
    setBranchRounds((prev) => ({
      ...prev,
      [currentUnit.id]: nextRound,
    }));
    setBranchExpandedRounds((prev) => ({
      ...prev,
      [currentUnit.id]: {
        ...(Object.keys(prev[currentUnit.id] ?? {}).reduce<Record<number, boolean>>((acc, key) => {
          acc[Number(key)] = false;
          return acc;
        }, {})),
        [nextRound]: true,
      },
    }));
    setBranchMessageHistory((prev) => ({
      ...prev,
      [currentUnit.id]: [
        ...existingHistory,
        {
          id: `${currentUnit.id}-branch-divider-${nextRound}`,
          role: "ai",
          unitId: currentUnit.id,
          text: buildBranchRoundDividerText(nextRound),
          type: "round-divider",
        },
        {
          id: `${currentUnit.id}-branch-current-${nextRound}`,
          role: "ai",
          unitId: currentUnit.id,
          text: "这是你当前采用的版本。你可以继续基于这一版修改，或者直接采用。",
          type: "section",
          versionItem: currentVersion,
        },
      ],
    }));
  };

  const handleCloseBranch = () => {
    setBranchUnitId(null);
    setBranchInput("");
    setBranchActiveQuickActionLabel(null);
    setBranchInputPlaceholder(
      "继续告诉我你希望这段经历怎么调整，例如：保留核心结果、弱化学生感、加强岗位关键词、改得更专业",
    );
  };

  const appendBranchMessages = (unitId: string, messages: ChatMessage[]) => {
    setBranchMessageHistory((prev) => ({
      ...prev,
      [unitId]: [...(prev[unitId] ?? []), ...messages],
    }));
  };

  const handleToggleBranchRound = (unitId: string, round: number) => {
    setBranchExpandedRounds((prev) => ({
      ...prev,
      [unitId]: {
        ...(prev[unitId] ?? {}),
        [round]: !(prev[unitId]?.[round] ?? false),
      },
    }));
  };

  const handleSelectBranchQuickAction = (action: QuickAction) => {
    setBranchInput(action.prompt);
    setBranchActiveQuickActionLabel(action.label);
    requestAnimationFrame(() => {
      resizeBranchInput();
      branchInputRef.current?.focus();
    });
  };

  const handleBranchGapFormAnswerChange = (gapId: string, value: string) => {
    setBranchGapFormState((prev) => ({
      ...prev,
      assignments: {
        ...prev.assignments,
        [gapId]: {
          ...(prev.assignments[gapId] ?? createEmptyBranchGapAssignmentItemState()),
          userAnswer: value,
          error: "",
        },
      },
    }));
  };

  const handleBranchGapAssignmentSelect = (
    gapId: string,
    selectedSection: BranchGapAssignmentSection,
    selectedUnitId: string,
  ) => {
    setBranchGapFormState((prev) => ({
      ...prev,
      assignments: {
        ...prev.assignments,
        [gapId]: (() => {
          const currentAssignment =
            prev.assignments[gapId] ?? createEmptyBranchGapAssignmentItemState();
          const isSameSelection =
            currentAssignment.selectedSection === selectedSection &&
            currentAssignment.selectedUnitId === selectedUnitId;

          if (isSameSelection) {
            return {
              ...currentAssignment,
              selectedSection: "",
              selectedUnitId: "",
              selectorOpen: false,
              error: "",
            };
          }

          return {
            ...currentAssignment,
            selectedSection,
            selectedUnitId,
            selectorOpen: false,
            error: "",
          };
        })(),
      },
    }));
  };

  const handleToggleBranchGapAssignmentSelector = (gapId: string) => {
    setBranchGapFormState((prev) => ({
      ...prev,
      assignments: {
        ...prev.assignments,
        [gapId]: {
          ...(prev.assignments[gapId] ?? createEmptyBranchGapAssignmentItemState()),
          selectorOpen: !(prev.assignments[gapId]?.selectorOpen ?? false),
        },
      },
    }));
  };

  const handleToggleBranchGapGuide = (gapId: string) => {
    setBranchGapFormState((prev) => ({
      ...prev,
      assignments: {
        ...prev.assignments,
        [gapId]: {
          ...(prev.assignments[gapId] ?? createEmptyBranchGapAssignmentItemState()),
          guideOpen: !(prev.assignments[gapId]?.guideOpen ?? false),
        },
      },
    }));
  };

  const handleSubmitGlobalGapForm = () => {
    if (!draftJsonState || !globalGapAnalysisData) {
      return;
    }

    const validationResult = buildValidatedGapAssignments(
      globalGapAnalysisData.gaps,
      branchGapFormState.assignments,
    );
    const nextAssignments = validationResult.assignments as Record<string, BranchGapAssignmentItemState>;

    if (validationResult.hasValidationError) {
      setBranchGapFormState((prev) => ({
        ...prev,
        assignments: nextAssignments,
      }));
      const firstInvalidGap = globalGapAnalysisData.gaps.find((gap) => nextAssignments[gap.gapId]?.error);
      if (firstInvalidGap) {
        scrollToBranchGapCard(firstInvalidGap.gapId);
      }
      return;
    }

    setBranchGapFormState((prev) => ({
      ...prev,
      assignments: nextAssignments,
      submitting: true,
      completed: false,
    }));
    setBranchOptimizing(true);
    setDebugMemoryWriterResults([]);
    setDebugOptimizeResults([]);

    void (async () => {
      try {
        const nextSandboxStates = { ...branchSandboxStates };
        const nextDebugMemoryWriterResults: DebugMemoryWriterResultItem[] = [];
        const nextDebugOptimizeResults: DebugOptimizeResultItem[] = [];
        const targetJd = parseJdJsonInput(parsedJdJson);
        const experienceUnits = confirmationQueue.filter((item) => isOptimizableSection(item.sectionKey));
        const affectedUnitIds = collectAffectedUnitIdsFromAssignments(nextAssignments);

        for (const experienceUnit of experienceUnits) {
          const existingState =
            nextSandboxStates[experienceUnit.id] ??
            createBranchSandboxState({
              unit: experienceUnit,
              currentDraft:
                branchSourceVersions[experienceUnit.id] ??
                pendingOptimizations[experienceUnit.id] ??
                getOptimizableItemFromDraftJson(draftJsonState, experienceUnit)!,
              targetJd,
              targetJobTitle: workflowTargetRole,
            });

          nextSandboxStates[experienceUnit.id] = {
            ...existingState,
            gapContext: existingState.gapContext.filter(
              (item) => !globalGapAnalysisData.gaps.some((gap) => gap.gapId === item.gapId),
            ),
            timestamps: {
              ...existingState.timestamps,
              updatedAt: new Date().toISOString(),
            },
          };
        }

        for (const gap of globalGapAnalysisData.gaps) {
          const assignment = nextAssignments[gap.gapId];

          if (!assignment || assignment.status !== "answered" || !assignment.selectedUnitId) {
            continue;
          }

          const response = await fetch("/api/branch-memory-writer", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              gapType: gap.gapType,
              gapTitle: gap.gapTitle,
              mainQuestion: gap.mainQuestion,
              userFormAnswer: assignment.userAnswer.trim(),
            }),
          });

          const data = await parseApiJson<BranchMemoryWriterResponse>(response);

          if (!response.ok) {
            throw new Error("error" in data ? data.error : "Memory Writer 处理失败");
          }

          if (!("userAnswer" in data)) {
            throw new Error("Memory Writer 返回格式不正确");
          }

          nextDebugMemoryWriterResults.push({
            gapId: gap.gapId,
            gapTitle: gap.gapTitle,
            selectedUnitId: assignment.selectedUnitId,
            selectedSection: assignment.selectedSection,
            result: data,
          });

          const targetSandboxState = nextSandboxStates[assignment.selectedUnitId];

          if (!targetSandboxState) {
            throw new Error("未找到这条差距对应的经历沙箱");
          }

          nextSandboxStates[assignment.selectedUnitId] = {
            ...targetSandboxState,
            gapContext: [
              ...targetSandboxState.gapContext,
              buildGapContextItemFromResult(gap, data),
            ],
            timestamps: {
              ...targetSandboxState.timestamps,
              updatedAt: new Date().toISOString(),
            },
          };
        }

        const nextPendingOptimizations = { ...pendingOptimizations };
        const nextBranchSourceVersions = { ...branchSourceVersions };
        const nextBranchMemories = { ...branchMemories };

        for (const affectedUnitId of affectedUnitIds) {
          const targetSandboxState = nextSandboxStates[affectedUnitId];

          if (!targetSandboxState) {
            continue;
          }

          const optimizeResponse = await fetch("/api/optimize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              targetJob: targetSandboxState.targetJob,
              currentDraft: targetSandboxState.currentDraft,
              gapContext: targetSandboxState.gapContext,
              resumeRules: targetSandboxState.resumeRules,
            }),
          });

          const optimizeData = await parseApiJson<OptimizeResponse>(optimizeResponse);

          if (!optimizeResponse.ok) {
            throw new Error("error" in optimizeData ? optimizeData.error : "经历优化失败");
          }

          if (!("result" in optimizeData) || !optimizeData.result.trim()) {
            throw new Error("经历优化没有返回可用结果");
          }

          const optimizedItem = JSON.parse(optimizeData.result) as BranchEditableTarget;
          const optimizedSandboxState = updateSandboxOptimizeResult(targetSandboxState, optimizedItem);

          nextSandboxStates[affectedUnitId] = optimizedSandboxState;
          nextPendingOptimizations[affectedUnitId] = optimizedItem;
          nextBranchSourceVersions[affectedUnitId] = optimizedItem;
          nextDebugOptimizeResults.push({
            unitId: affectedUnitId,
            unitLabel: confirmationQueue.find((unit) => unit.id === affectedUnitId)?.label ?? affectedUnitId,
            result: optimizedItem,
          });
          nextBranchMemories[affectedUnitId] = {
            ...(nextBranchMemories[affectedUnitId] ?? createInitialBranchMemory(optimizedItem)),
            mode: "user-driven",
            lastOptimizedVersion: optimizedItem,
          };
        }

        setBranchSandboxStates(nextSandboxStates);
        setPendingOptimizations(nextPendingOptimizations);
        setBranchSourceVersions(nextBranchSourceVersions);
        setBranchMemories(nextBranchMemories);
        setDebugMemoryWriterResults(nextDebugMemoryWriterResults);
        setDebugOptimizeResults(nextDebugOptimizeResults);
        setBranchGapFormState((prev) => ({
          ...prev,
          assignments: nextAssignments,
          submitting: false,
          completed: true,
        }));
        setBranchInputPlaceholder("现在可以继续直接说你还想怎么改，我会基于当前经历和已生成的新版本继续精修。");
        setCurrentStep(6);
        setMaxReachedStep((prev) => Math.max(prev, 6) as Step);
        setError("");
      } catch (err) {
        setBranchGapFormState((prev) => ({
          ...prev,
          assignments: nextAssignments,
          submitting: false,
          completed: false,
        }));
        setError(err instanceof Error ? err.message : "当前差距补充链路处理失败，请稍后再试。");
      } finally {
        setBranchOptimizing(false);
      }
    })();
  };

  const handleContinueBranchWithVersion = (unit: ConfirmationUnit, versionItem: BranchEditableTarget) => {
    setBranchSourceVersions((prev) => ({
      ...prev,
      [unit.id]: versionItem,
    }));
    setBranchActiveQuickActionLabel(null);
    setBranchInputPlaceholder("请继续基于这一版描述你希望怎么调整");
    appendBranchMessages(unit.id, [
      {
        id: `${unit.id}-branch-continue-note-${Date.now()}`,
        role: "ai",
        unitId: unit.id,
        text: "好，我们就基于你选中的这一版继续修改。请继续告诉我你希望怎么调整。",
        type: "modify-placeholder",
      },
      {
        id: `${unit.id}-branch-continue-card-${Date.now() + 1}`,
        role: "ai",
        unitId: unit.id,
        text: "这是你当前选中的版本，接下来会基于这一版继续修改。",
        type: "section",
        versionItem,
      },
    ]);
    requestAnimationFrame(() => {
      resizeBranchInput();
      branchInputRef.current?.focus();
    });
  };

  const handleBranchSendChat = () => {
    const value = branchInput.trim();

    if (!value || !branchUnitId || !draftJsonState) {
      return;
    }

    const targetUnit = confirmationQueue.find((unit) => unit.id === branchUnitId);

    if (!targetUnit) {
      return;
    }

    if (isOptimizableSection(targetUnit.sectionKey)) {
      const targetJd = parseJdJsonInput(parsedJdJson);
      const existingSandboxState =
        branchSandboxStates[targetUnit.id] ??
        createBranchSandboxState({
          unit: targetUnit,
          currentDraft:
            branchSourceVersions[targetUnit.id] ??
            pendingOptimizations[targetUnit.id] ??
            getOptimizableItemFromDraftJson(draftJsonState, targetUnit)!,
          targetJd,
          targetJobTitle: workflowTargetRole,
        });
      const nextUserMessageId = `${branchUnitId}-branch-user-${Date.now()}`;

      appendBranchMessages(branchUnitId, [
        {
          id: nextUserMessageId,
          role: "user",
          unitId: branchUnitId,
          text: value,
          type: "user-input",
        },
      ]);
      setBranchInput("");
      setBranchActiveQuickActionLabel(null);
      setBranchInputPlaceholder("正在根据你的要求整理这一段经历，请稍等。");
      setBranchOptimizing(true);
      setBranchPlanningStates((prev) => ({
        ...prev,
        [targetUnit.id]: buildBranchPlanningState("direct-editing"),
      }));

      void (async () => {
        try {
          const nextSandboxState = {
            ...existingSandboxState,
            latestUserInstruction: value,
            timestamps: {
              ...existingSandboxState.timestamps,
              updatedAt: new Date().toISOString(),
            },
          };

          setBranchSandboxStates((prev) => ({
            ...prev,
            [targetUnit.id]: nextSandboxState,
          }));
          setBranchPlanningStates((prev) => ({
            ...prev,
            [targetUnit.id]: buildBranchPlanningState("generating"),
          }));
          setBranchMemories((prev) => ({
            ...prev,
            [targetUnit.id]: {
              ...(prev[targetUnit.id] ??
                createInitialBranchMemory(
                  branchSourceVersions[targetUnit.id] ??
                    pendingOptimizations[targetUnit.id] ??
                    getOptimizableItemFromDraftJson(draftJsonState, targetUnit) ??
                    ({} as BranchEditableTarget),
                )),
              mode: "user-driven",
            },
          }));

          const refineResponse = await fetch("/api/refine", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              targetJd: nextSandboxState.targetJob.jd,
              currentDraft: nextSandboxState.currentDraft,
              resumeRules: nextSandboxState.resumeRules,
              latestUserInstruction: value,
            }),
          });

          const refineData = await parseApiJson<OptimizeResponse>(refineResponse);

          if (!refineResponse.ok) {
            throw new Error("error" in refineData ? refineData.error : "经历精修失败");
          }

          if (!("result" in refineData) || !refineData.result.trim()) {
            throw new Error("经历精修没有返回可用结果");
          }

          const optimizedItem = JSON.parse(refineData.result) as BranchEditableTarget;
          const optimizedSandboxState = updateSandboxOptimizeResult(nextSandboxState, optimizedItem);

          setBranchSandboxStates((prev) => ({
            ...prev,
            [targetUnit.id]: optimizedSandboxState,
          }));
          setPendingOptimizations((prev) => ({
            ...prev,
            [targetUnit.id]: optimizedItem,
          }));
          setBranchSourceVersions((prev) => ({
            ...prev,
            [targetUnit.id]: optimizedItem,
          }));
          setBranchMemories((prev) => ({
            ...prev,
            [targetUnit.id]: {
              ...(prev[targetUnit.id] ?? createInitialBranchMemory(optimizedItem)),
              mode: "user-driven",
              lastOptimizedVersion: optimizedItem,
            },
          }));
          appendBranchMessages(targetUnit.id, [
            {
              id: `${targetUnit.id}-branch-direct-edit-note-${Date.now()}`,
              role: "ai",
              unitId: targetUnit.id,
              text: "我先按你刚刚给出的方向改了一版，你先看看这版是否更接近你想要的感觉。",
              type: "modify-placeholder",
            },
            {
              id: `${targetUnit.id}-branch-direct-edit-result-${Date.now() + 1}`,
              role: "ai",
              unitId: targetUnit.id,
              text: `这是我基于你刚刚要求调整后的【${targetUnit.label}】版本。`,
              type: "optimize-result",
              versionItem: optimizedItem,
            },
          ]);
          setBranchPlanningStates((prev) => {
            const next = { ...prev };
            delete next[targetUnit.id];
            return next;
          });
          setBranchInputPlaceholder("如果还想继续收紧语气、强调重点或调整方向，直接告诉我就行。");
        } catch (err) {
          setBranchPlanningStates((prev) => ({
            ...prev,
            [targetUnit.id]: buildBranchPlanningState("direct-editing", {
              title: "这一轮处理暂时中断了",
              subtext: "我还没把这条回复顺利接到当前经历优化链路里。",
              nextStep: "你可以稍后重试，或者继续直接输入修改要求",
              lockInput: false,
            }),
          }));
          appendBranchMessages(targetUnit.id, [
            {
              id: `${targetUnit.id}-branch-runtime-error-${Date.now()}`,
              role: "ai",
              unitId: targetUnit.id,
              text: err instanceof Error ? err.message : "当前经历精修链路接入失败，请稍后再试。",
              type: "modify-placeholder",
            },
          ]);
          setBranchInputPlaceholder("当前链路暂时失败，你可以稍后再试。");
        } finally {
          setBranchOptimizing(false);
        }
      })();

      return;
    }

    const targetDraftJson =
      branchSourceVersions[targetUnit.id] ??
      pendingOptimizations[targetUnit.id] ??
      getOptimizableItemFromDraftJson(draftJsonState, targetUnit);
    if (!targetDraftJson) {
      return;
    }

    const jdJson = parseJdJsonInput(parsedJdJson);
    const optimizeUserPrompt = value;

    appendBranchMessages(branchUnitId, [
      {
        id: `${branchUnitId}-branch-user-${Date.now()}`,
        role: "user",
        unitId: branchUnitId,
        text: value,
        type: "user-input",
      },
      {
        id: `${branchUnitId}-branch-optimizing-${Date.now() + 1}`,
        role: "ai",
        unitId: branchUnitId,
        text: `正在为【${targetUnit.label}】生成新的分支版本，请稍等。`,
        type: "modify-placeholder",
      },
    ]);
    setBranchInput("");
    setBranchActiveQuickActionLabel(null);
    setBranchOptimizing(true);

    void (async () => {
      try {
          const response = await fetch("/api/refine", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              targetJd: jdJson,
              currentDraft: targetDraftJson,
              resumeRules: OPTIMIZE_REWRITE_RULES,
              latestUserInstruction: optimizeUserPrompt,
            }),
          });

          const data = await parseApiJson<OptimizeResponse>(response);

          if (!response.ok) {
            throw new Error("error" in data ? data.error : "AI 精修失败");
          }

          if (!("result" in data) || !data.result.trim()) {
            throw new Error("AI 精修没有返回可用结果");
          }

        const optimizedItem = JSON.parse(data.result) as BranchEditableTarget;
        setPendingOptimizations((prev) => ({
          ...prev,
          [targetUnit.id]: optimizedItem,
        }));
        setBranchSourceVersions((prev) => ({
          ...prev,
          [targetUnit.id]: optimizedItem,
        }));
        setBranchMemories((prev) => ({
          ...prev,
          [targetUnit.id]: prev[targetUnit.id]
            ? {
                ...prev[targetUnit.id],
                lastOptimizedVersion: optimizedItem,
              }
            : createInitialBranchMemory(optimizedItem),
        }));
        appendBranchMessages(targetUnit.id, [
          {
            id: `${targetUnit.id}-branch-result-${Date.now()}`,
            role: "ai",
            unitId: targetUnit.id,
            text: `我先生成了一版新的【${targetUnit.label}】分支结果，你可以先预览，再决定是否采用。`,
            type: "optimize-result",
            versionItem: optimizedItem,
          },
        ]);
      } catch (err) {
        appendBranchMessages(targetUnit.id, [
          {
            id: `${targetUnit.id}-branch-error-${Date.now()}`,
            role: "ai",
            unitId: targetUnit.id,
            text: err instanceof Error ? err.message : "AI 优化失败，请稍后再试。",
            type: "modify-placeholder",
          },
        ]);
      } finally {
        setBranchOptimizing(false);
      }
    })();
  };

  const handleBranchInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleBranchSendChat();
    }
  };

  const handleAcceptOptimizedResult = (
    unit: ConfirmationUnit,
    versionItem?: BranchEditableTarget,
  ) => {
    const optimizedItem = versionItem ?? pendingOptimizations[unit.id];

    if (!draftJsonState || !optimizedItem) {
      return;
    }

    setDraftJsonState((prev) => {
      if (!prev) {
        return prev;
      }

      return applyOptimizedItemToDraftJson(prev, unit, optimizedItem);
    });
    setPendingOptimizations((prev) => {
      const next = { ...prev };
      delete next[unit.id];
      return next;
    });
    setBranchSourceVersions((prev) => ({
      ...prev,
      [unit.id]: optimizedItem,
    }));
    appendBranchMessages(unit.id, [
      {
        id: `${unit.id}-apply-${Date.now()}`,
        role: "ai",
        unitId: unit.id,
        text: `已将【${unit.label}】的这一版应用到当前简历预览。`,
        type: "modify-placeholder",
      },
    ]);

    if (!acceptedUnits[unit.id]) {
      markUnitAccepted(unit);
    }

    setRecentlyAdoptedUnitId(unit.id);
    handleCloseBranch();
  };

  const reorderOverviewUnitsWithinSection = (sourceUnit: ConfirmationUnit, targetItemIndex: number) => {
    if (
      !draftJsonState ||
      sourceUnit.itemIndex === null ||
      (sourceUnit.sectionKey !== "internships" &&
        sourceUnit.sectionKey !== "projects" &&
        sourceUnit.sectionKey !== "other_experiences")
    ) {
      return;
    }

    const sectionUnits = confirmationQueue.filter((unit) => unit.sectionKey === sourceUnit.sectionKey);
    const maxIndex = Math.max(0, sectionUnits.length - 1);
    const safeTargetIndex = Math.max(0, Math.min(maxIndex, targetItemIndex));

    if (safeTargetIndex === sourceUnit.itemIndex) {
      setActiveOverviewSortMenuUnitId(null);
      return;
    }

    setDraftJsonState((prev) => {
      if (!prev) {
        return prev;
      }

      if (sourceUnit.sectionKey === "internships") {
        return {
          ...prev,
          internships: {
            ...prev.internships,
            items: reorderItems(prev.internships.items, sourceUnit.itemIndex, safeTargetIndex),
          },
        };
      }

      if (sourceUnit.sectionKey === "projects") {
        return {
          ...prev,
          projects: {
            ...prev.projects,
            items: reorderItems(prev.projects.items, sourceUnit.itemIndex, safeTargetIndex),
          },
        };
      }

      return {
        ...prev,
        other_experiences: {
          ...prev.other_experiences,
          items: reorderItems(prev.other_experiences.items, sourceUnit.itemIndex, safeTargetIndex),
        },
      };
    });

    setConfirmationQueue((prev) => {
      const sectionQueueIndexes = prev
        .map((unit, index) => ({ unit, index }))
        .filter((entry) => entry.unit.sectionKey === sourceUnit.sectionKey);
      const sourceEntry = sectionQueueIndexes.find((entry) => entry.unit.id === sourceUnit.id);
      if (!sourceEntry) {
        return prev;
      }

      const targetEntry = sectionQueueIndexes[safeTargetIndex];
      if (!targetEntry) {
        return prev;
      }

      const reorderedQueue = reorderItems(prev, sourceEntry.index, targetEntry.index);
      return reorderedQueue.map((unit) => {
        if (unit.sectionKey !== sourceUnit.sectionKey || unit.itemIndex === null) {
          return unit;
        }
        const sectionIndex = reorderedQueue
          .filter((item) => item.sectionKey === sourceUnit.sectionKey)
          .findIndex((item) => item.id === unit.id);
        return {
          ...unit,
          itemIndex: sectionIndex,
        } as ConfirmationUnit;
      });
    });

    setCurrentUnitIndex((prev) => {
      const currentUnit = confirmationQueue[prev];
      if (!currentUnit || currentUnit.sectionKey !== sourceUnit.sectionKey || currentUnit.itemIndex === null) {
        return prev;
      }

      if (currentUnit.id === sourceUnit.id) {
        const reorderedSectionUnits = reorderItems(sectionUnits, sourceUnit.itemIndex, safeTargetIndex);
        const movedIndex = reorderedSectionUnits.findIndex((unit) => unit.id === sourceUnit.id);
        const movedUnit = reorderedSectionUnits[movedIndex];
        const nextQueue = confirmationQueue.map((unit) => unit.id);
        return nextQueue.findIndex((unitId) => unitId === movedUnit.id);
      }

      return prev;
    });

    setActiveOverviewSortMenuUnitId(null);
  };

  const handleOverviewMoveUp = (unit: ConfirmationUnit) => {
    if (unit.itemIndex === null) {
      return;
    }
    reorderOverviewUnitsWithinSection(unit, unit.itemIndex - 1);
  };

  const handleOverviewMoveDown = (unit: ConfirmationUnit) => {
    if (unit.itemIndex === null) {
      return;
    }
    reorderOverviewUnitsWithinSection(unit, unit.itemIndex + 1);
  };

  const handleOverviewMoveTop = (unit: ConfirmationUnit) => {
    reorderOverviewUnitsWithinSection(unit, 0);
  };

  const handleOpenExportHub = () => {
    if (previewSinglePageOverflow.hasOverflow) {
      setPreviewOverflowDismissedSignature(null);
      setIsPreviewOverflowModalOpen(true);
      return;
    }

    setMaxReachedStep((prev) => Math.max(prev, 7) as Step);
    setCurrentStep(7);
    setError("");
  };

  const triggerClientDownload = useCallback((href: string, filename: string) => {
    if (typeof window === "undefined") {
      return;
    }

    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      if (link.parentNode) {
        document.body.removeChild(link);
      }
    }, 0);
  }, []);

  const triggerBlobDownload = useCallback(
    (blob: Blob, filename: string) => {
      if (typeof window === "undefined") {
        return;
      }

      const url = URL.createObjectURL(blob);
      triggerClientDownload(url, filename);
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 30_000);
    },
    [triggerClientDownload],
  );

  const sanitizeFileNamePart = useCallback((value: string) => value.replace(/[\\/:*?"<>|]/g, "_").trim(), []);

  const getDraftBasicValue = useCallback(
    (...labels: string[]) =>
      (draftJsonState?.basic_info?.items ?? [])
        .find((item) => labels.includes(item.label.trim()))
        ?.value.trim() ?? "",
    [draftJsonState],
  );

  const getExportIdentity = useCallback(() => {
    const name =
      getDraftBasicValue("姓名") ||
      resumeForm.basicInfo.name.trim() ||
      "未命名";
    const phone =
      getDraftBasicValue("电话", "手机号") ||
      resumeForm.basicInfo.phone.trim() ||
      "联系电话";
    const role =
      workflowTargetRole.trim() ||
      resumeForm.basicInfo.targetRole.trim() ||
      "目标岗位";

    return {
      name: sanitizeFileNamePart(name),
      phone: sanitizeFileNamePart(phone),
      role: sanitizeFileNamePart(role),
    };
  }, [getDraftBasicValue, resumeForm.basicInfo.name, resumeForm.basicInfo.phone, resumeForm.basicInfo.targetRole, sanitizeFileNamePart, workflowTargetRole]);

  async function waitForExportSnapshotReady() {
    if (typeof window === "undefined") {
      return;
    }

    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => window.setTimeout(resolve, 80));

    try {
      if ("fonts" in document) {
        await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
      }
    } catch {
      // Ignore font readiness failures and continue.
    }
  }

  async function captureExportPageCanvases() {
    if (typeof window === "undefined") {
      throw new Error("当前环境不支持导出。");
    }

    await waitForExportSnapshotReady();

    const imageNodes = imageExportPageRefs.current.filter(
      (node): node is HTMLDivElement => Boolean(node && node.isConnected),
    );
    const previewNodes = previewPageRefs.current.filter(
      (node): node is HTMLDivElement => Boolean(node && node.isConnected),
    );
    const exportNodes = printPageRefs.current.filter(
      (node): node is HTMLDivElement => Boolean(node && node.isConnected),
    );
    const pageNodes =
      exportNodes.length > 0
        ? exportNodes
        : previewNodes.length > 0
          ? previewNodes
          : imageNodes;

    if (pageNodes.length === 0) {
      throw new Error("当前没有可导出的简历页面");
    }

    const exportRenderScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
    const canvases: HTMLCanvasElement[] = [];
    for (const pageNode of pageNodes) {
      const canvas = await html2canvas(pageNode, {
        backgroundColor: "#ffffff",
        scale: exportRenderScale,
        useCORS: true,
        logging: false,
        onclone: (clonedDocument) => {
          clonedDocument
            .querySelectorAll<HTMLElement>("#image-export-preview, #print-export-preview")
            .forEach((container) => {
              container.style.left = "0px";
              container.style.top = "0px";
              container.style.right = "auto";
              container.style.transform = "none";
              container.style.zIndex = "-1";
            });
        },
      });

      canvases.push(canvas);
    }

    return canvases;
  }

  async function buildResumePdfBlob() {
    const canvases = await captureExportPageCanvases();
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    canvases.forEach((canvas, index) => {
      if (index > 0) {
        doc.addPage("a4", "portrait");
      }

      doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
    });

    return doc.output("blob");
  }

  async function triggerBrowserPrintForResume() {
    if (typeof window === "undefined") {
      throw new Error("当前环境不支持打印。");
    }

    const exportNodes = printPageRefs.current.filter(
      (node): node is HTMLDivElement => Boolean(node && node.isConnected),
    );

    if (exportNodes.length === 0) {
      throw new Error("当前没有可打印的简历页面");
    }

    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));

    try {
      if ("fonts" in document) {
        await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
      }
    } catch {
      // Ignore font readiness failures and continue printing.
    }

    await new Promise<void>((resolve) => {
      let finished = false;
      const finalize = () => {
        if (finished) {
          return;
        }
        finished = true;
        window.removeEventListener("afterprint", handleAfterPrint);
        window.clearTimeout(timeoutId);
        resolve();
      };

      const handleAfterPrint = () => {
        window.setTimeout(finalize, 0);
      };

      const timeoutId = window.setTimeout(finalize, 4000);
      window.addEventListener("afterprint", handleAfterPrint, { once: true });
      window.setTimeout(() => {
        window.focus();
        window.print();
      }, 120);
    });
  }

  async function buildResumeImageFiles() {
    const canvases = await captureExportPageCanvases();
    const canvasToBlob = (canvas: HTMLCanvasElement) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(new Error("图片导出失败，请稍后再试。"));
        }, "image/png");
      });

    return Promise.all(canvases.map((canvas) => canvasToBlob(canvas)));
  }

  async function buildResumeWordBlob() {
    if (!draftJsonState || acceptedPreviewSections.length === 0) {
      throw new Error("没有可导出的简历内容");
    }

    const {
      AlignmentType,
      BorderStyle,
      Document,
      Packer,
      Paragraph,
      Table,
      TableCell,
      TableRow,
      TextRun,
      WidthType,
    } = await import("docx");

    const wordFont =
      previewSettings.fontFamily === "kaiti"
        ? "KaiTi"
        : previewSettings.fontFamily === "serif"
          ? "SimSun"
          : "Microsoft YaHei";
    const bodySize = previewSettings.fontSize === "small" ? 20 : previewSettings.fontSize === "large" ? 24 : 22;
    const metaSize = Math.max(18, bodySize - 2);
    const sectionSize = bodySize + 4;
    const titleSize = bodySize + 8;
    const contentChildren: import("docx").FileChild[] = [];
    const noBorders = {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    };
    const cellMargins = { top: 0, bottom: 0, left: 0, right: 0 };
    const twipFromMm = (value: number) => Math.round(value * 56.6929);
    const getBasicValue = (...labels: string[]) =>
      (draftJsonState.basic_info?.items ?? [])
        .find((item) => labels.includes(item.label.trim()))
        ?.value.trim() ?? "";
    const textRun = (text: string, options?: { bold?: boolean; size?: number }) =>
      new TextRun({
        text,
        bold: options?.bold,
        size: options?.size ?? bodySize,
        font: wordFont,
      });
    const paragraph = (
      text: string,
      options?: { bold?: boolean; size?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingAfter?: number },
    ) =>
      new Paragraph({
        children: [textRun(text, { bold: options?.bold, size: options?.size })],
        alignment: options?.alignment,
        spacing: { after: options?.spacingAfter ?? 60 },
      });
    const mixedParagraph = (
      runs: import("docx").ParagraphChild[],
      options?: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingAfter?: number },
    ) =>
      new Paragraph({
        children: runs,
        alignment: options?.alignment,
        spacing: { after: options?.spacingAfter ?? 60 },
      });
    const emptyParagraph = () => new Paragraph({ children: [textRun("")], spacing: { after: 40 } });
    const tableCell = (
      children: import("docx").FileChild[],
      options?: { widthPercent?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] },
    ) =>
      new TableCell({
        children,
        width: options?.widthPercent
          ? { size: options.widthPercent, type: WidthType.PERCENTAGE }
          : undefined,
        margins: cellMargins,
        verticalAlign: "center",
      });
    const singleLineCell = (
      text: string,
      options?: { widthPercent?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; bold?: boolean },
    ) =>
      tableCell(
        [
          new Paragraph({
            children: [textRun(text || "—", { bold: options?.bold })],
            alignment: options?.alignment,
            spacing: { after: 0 },
          }),
        ],
        { widthPercent: options?.widthPercent },
      );
    const addSectionTitle = (title: string) => {
      contentChildren.push(
        new Paragraph({
          children: [textRun(title, { bold: true, size: sectionSize })],
          spacing: { before: 120, after: 70 },
          border: {
            bottom: {
              color: "D7E1E8",
              space: 1,
              style: BorderStyle.SINGLE,
              size: 6,
            },
          },
        }),
      );
    };
    const addLabeledLine = (label: string, content: string) => {
      if (!label.trim() && !content.trim()) {
        return;
      }

      contentChildren.push(
        mixedParagraph(
          [
            label ? textRun(`${label}：`, { bold: true }) : textRun(""),
            textRun(content),
          ],
          { spacingAfter: 50 },
        ),
      );
    };
    const addExperience = (title: string, role: string, dateRange: string, bullets: DraftJsonBullet[]) => {
      contentChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorders,
          rows: [
            new TableRow({
              children: [
                singleLineCell(title, { widthPercent: 42, alignment: AlignmentType.LEFT, bold: true }),
                singleLineCell(role, { widthPercent: 32, alignment: AlignmentType.CENTER, bold: true }),
                singleLineCell(dateRange, { widthPercent: 26, alignment: AlignmentType.RIGHT, bold: true }),
              ],
            }),
          ],
        }),
      );

      bullets.forEach((bullet) => {
        const label = bullet.label?.trim();
        const content = bullet.content?.trim();
        if (!label && !content) {
          return;
        }

        contentChildren.push(
          mixedParagraph(
            [
              textRun("• "),
              label ? textRun(`${label}：`, { bold: true }) : textRun(""),
              textRun(content),
            ],
            { spacingAfter: 50 },
          ),
        );
      });
    };

    const name = getBasicValue("姓名");
    const phone = getBasicValue("电话", "手机号");
    const email = getBasicValue("邮箱", "Email", "email");
    const targetRole = getBasicValue("意向岗位", "目标岗位");
    const portfolio = getBasicValue("作品集");
    const github = getBasicValue("GitHub", "Github", "github");
    const contactRow = [
      phone ? `电话：${phone}` : "",
      email ? `邮箱：${email}` : "",
      targetRole ? `意向岗位：${targetRole}` : "",
    ].filter(Boolean);
    const linkRow = [
      portfolio ? `作品集：${portfolio}` : "",
      github ? `GitHub：${github}` : "",
    ].filter(Boolean);

    if (name) {
      contentChildren.push(paragraph(name, { bold: true, size: titleSize, alignment: AlignmentType.CENTER, spacingAfter: 40 }));
    }
    if (contactRow.length > 0) {
      contentChildren.push(paragraph(contactRow.join(" | "), { size: metaSize, alignment: AlignmentType.CENTER, spacingAfter: 30 }));
    }
    if (linkRow.length > 0) {
      contentChildren.push(paragraph(linkRow.join(" | "), { size: metaSize, alignment: AlignmentType.CENTER, spacingAfter: 80 }));
    }

    acceptedPreviewSections
      .filter((section) => section.sectionKey !== "basic_info")
      .forEach((section) => {
        if (section.units.length === 0) {
          return;
        }

        addSectionTitle(section.title);

        if (section.sectionKey === "education") {
          (draftJsonState.education?.items ?? []).forEach((item, index) => {
            if (index > 0) {
              contentChildren.push(emptyParagraph());
            }

            contentChildren.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      singleLineCell(item.school, { widthPercent: 25, alignment: AlignmentType.LEFT, bold: true }),
                      singleLineCell(item.major, { widthPercent: 25, alignment: AlignmentType.CENTER, bold: true }),
                      singleLineCell(item.degree, { widthPercent: 25, alignment: AlignmentType.CENTER, bold: true }),
                      singleLineCell(formatDateRange(item.start_date, item.end_date), {
                        widthPercent: 25,
                        alignment: AlignmentType.RIGHT,
                        bold: true,
                      }),
                    ],
                  }),
                ],
              }),
            );

            const courseText = (item.courses ?? []).join("、");
            const gpaRankText = [
              item.gpa ? `GPA：${item.gpa}` : "",
              item.ranking ? `排名：${item.ranking}` : "",
            ].filter(Boolean);

            if (courseText || gpaRankText.length > 0) {
              addLabeledLine("课程", `${courseText}${gpaRankText.length > 0 ? ` 「${gpaRankText.join(" | ")}」` : ""}`);
            }

            if ((item.honors ?? []).length > 0) {
              addLabeledLine("荣誉", item.honors.join("、"));
            }
          });
          return;
        }

        if (section.sectionKey === "internships") {
          section.units.forEach((unit, index) => {
            const item = unit.itemIndex === null ? null : draftJsonState.internships.items[unit.itemIndex];
            if (!item) {
              return;
            }
            if (index > 0) {
              contentChildren.push(emptyParagraph());
            }
            addExperience(item.company, item.role, formatDateRange(item.start_date, item.end_date), item.bullets ?? []);
          });
          return;
        }

        if (section.sectionKey === "projects") {
          section.units.forEach((unit, index) => {
            const item = unit.itemIndex === null ? null : draftJsonState.projects.items[unit.itemIndex];
            if (!item) {
              return;
            }
            if (index > 0) {
              contentChildren.push(emptyParagraph());
            }
            addExperience(item.name, item.role, formatDateRange(item.start_date, item.end_date), item.bullets ?? []);
          });
          return;
        }

        if (section.sectionKey === "other_experiences") {
          section.units.forEach((unit, index) => {
            const item = unit.itemIndex === null ? null : draftJsonState.other_experiences.items[unit.itemIndex];
            if (!item) {
              return;
            }
            if (index > 0) {
              contentChildren.push(emptyParagraph());
            }
            addExperience(
              [item.name, item.type].filter(Boolean).join(" | "),
              item.role,
              formatDateRange(item.start_date, item.end_date),
              item.bullets ?? [],
            );
          });
          return;
        }

        if (section.sectionKey === "skills") {
          (draftJsonState.skills?.items ?? [])
            .filter((item) => item.label.trim() || item.content.trim())
            .forEach((item) => addLabeledLine(item.label, item.content));
          return;
        }

        if (section.sectionKey === "personal_advantages") {
          (draftJsonState.personal_advantages?.items ?? [])
            .map((item) => item.content.trim())
            .filter(Boolean)
            .forEach((content) => contentChildren.push(paragraph(content, { spacingAfter: 50 })));
        }
      });

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: twipFromMm(previewSettings.verticalMarginMm),
                bottom: twipFromMm(previewSettings.verticalMarginMm),
                left: twipFromMm(PREVIEW_MARGIN_CONFIG[previewSettings.margin].horizontalMm),
                right: twipFromMm(PREVIEW_MARGIN_CONFIG[previewSettings.margin].horizontalMm),
              },
            },
          },
          children: contentChildren,
        },
      ],
    });

    return Packer.toBlob(doc);
  }

  const handleExportPdf = async () => {
    if (typeof window === "undefined" || isExportingPdf) {
      return;
    }

    try {
      setIsExportingPdf(true);
      const pdfBlob = await buildResumePdfBlob();
      const { name, phone, role } = getExportIdentity();
      triggerBlobDownload(pdfBlob, `${name}—${phone}—${role}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF 导出失败，请稍后再试。");
    }
    setIsExportingPdf(false);
  };

  const handleExportWord = async () => {
    if (typeof window === "undefined" || isExportingWord) {
      return;
    }

    try {
      setIsExportingWord(true);
      const blob = await buildResumeWordBlob();
      const { name } = getExportIdentity();
      const exportName = sanitizeFileNamePart(name || resumeForm.basicInfo.name.trim() || "未命名");
      const fileName = `${exportName}—可编辑word版简历.docx`;
      triggerBlobDownload(blob, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Word 导出失败，请稍后再试。");
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleExportImages = async () => {
    if (typeof window === "undefined" || isExportingImages) {
      return;
    }

    try {
      setIsExportingImages(true);
      const imageBlobs = await buildResumeImageFiles();
      const { name } = getExportIdentity();

      if (imageBlobs.length === 1) {
        triggerBlobDownload(imageBlobs[0], `${name}—图片简历—BOSS直聘投递.png`);
        return;
      }

      const zip = new JSZip();

      for (const [index, blob] of imageBlobs.entries()) {
        zip.file(`${name}—图片简历—BOSS直聘投递-${index + 1}.png`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerBlobDownload(zipBlob, `${name}—图片简历—BOSS直聘投递.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片导出失败，请稍后再试。");
    } finally {
      setIsExportingImages(false);
    }
  };

  const handleDownloadBossGreeting = useCallback(() => {
    if (!bossGreetingAsset.content.trim()) {
      setError("当前还没有可下载的 Boss 打招呼语。");
      return;
    }

    const { name } = getExportIdentity();
    triggerBlobDownload(
      new Blob([bossGreetingAsset.content], { type: "text/plain;charset=utf-8" }),
      `${name}—打招呼语—BOSS直聘投递.txt`,
    );
  }, [bossGreetingAsset.content, getExportIdentity, triggerBlobDownload]);

  const handleDownloadCoverLetter = useCallback(() => {
    if (!coverLetterAsset.content.trim()) {
      setError("当前还没有可下载的邮件求职信。");
      return;
    }

    const { name } = getExportIdentity();
    triggerBlobDownload(
      new Blob([coverLetterAsset.content], { type: "text/plain;charset=utf-8" }),
      `${name}—求职信—邮件投递.txt`,
    );
  }, [coverLetterAsset.content, getExportIdentity, triggerBlobDownload]);

  const handleDownloadAllExports = async () => {
    if (typeof window === "undefined" || isExportingBundle) {
      return;
    }

    try {
      setIsExportingBundle(true);
      const zip = new JSZip();
      const { name, phone, role } = getExportIdentity();
      const folderName = `${name}—投递材料包`;
      const folder = zip.folder(folderName);

      if (!folder) {
        throw new Error("创建打包文件夹失败，请稍后再试。");
      }

      const [pdfBlob, wordBlob, imageBlobs] = await Promise.all([
        buildResumePdfBlob(),
        buildResumeWordBlob(),
        buildResumeImageFiles(),
      ]);

      folder.file(`${name}—${phone}—${role}.pdf`, pdfBlob);
      folder.file(`${name}—可编辑word版简历.docx`, wordBlob);

      if (imageBlobs.length === 1) {
        folder.file(`${name}—图片简历—BOSS直聘投递.png`, imageBlobs[0]);
      } else {
        imageBlobs.forEach((blob, index) => {
          folder.file(`${name}—图片简历—BOSS直聘投递-${index + 1}.png`, blob);
        });
      }

      if (coverLetterAsset.content.trim()) {
        folder.file(`${name}—求职信—邮件投递.txt`, coverLetterAsset.content.trim());
      }

      if (bossGreetingAsset.content.trim()) {
        folder.file(`${name}—打招呼语—BOSS直聘投递.txt`, bossGreetingAsset.content.trim());
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      triggerBlobDownload(zipBlob, `${folderName}.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "一键下载失败，请稍后再试。");
    } finally {
      setIsExportingBundle(false);
    }
  };

  const resetPreviewZoom = () => {
    setPreviewZoom(PREVIEW_MIN_ZOOM);
  };

  const handlePreviewTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const distance = getTouchDistance(event);
      if (distance) {
        pinchStartDistanceRef.current = distance;
        pinchStartZoomRef.current = previewZoom;
      }
      return;
    }

    if (event.touches.length === 1) {
      const now = Date.now();
      if (now - lastPreviewTapRef.current < 280) {
        resetPreviewZoom();
        lastPreviewTapRef.current = 0;
      } else {
        lastPreviewTapRef.current = now;
      }
    }
  };

  const handlePreviewTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || pinchStartDistanceRef.current === null) {
      return;
    }

    const distance = getTouchDistance(event);
    if (!distance) {
      return;
    }

    event.preventDefault();
    const nextZoom = clampPreviewZoom((distance / pinchStartDistanceRef.current) * pinchStartZoomRef.current);
    setPreviewZoom(nextZoom);
  };

  const handlePreviewTouchEnd = () => {
    if (pinchStartDistanceRef.current !== null) {
      pinchStartDistanceRef.current = null;
      pinchStartZoomRef.current = previewZoom;
    }
  };

  const handlePreviewWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();

    const viewportNode = previewViewportRef.current;
    if (!viewportNode) {
      return;
    }

    const viewportRect = viewportNode.getBoundingClientRect();
    const pointerOffsetX = event.clientX - viewportRect.left;
    const pointerOffsetY = event.clientY - viewportRect.top;
    const anchorX = viewportNode.scrollLeft + pointerOffsetX;
    const anchorY = viewportNode.scrollTop + pointerOffsetY;
    const zoomFactor = Math.exp(-event.deltaY * 0.0025);
    const nextZoom = clampPreviewZoom(previewZoom * zoomFactor);

    if (Math.abs(nextZoom - previewZoom) < 0.001) {
      return;
    }

    const currentScale = previewEffectiveScale;
    const nextScale = previewDisplayScale * nextZoom;
    const scaleRatio = nextScale / currentScale;

    setPreviewZoom(nextZoom);

    requestAnimationFrame(() => {
      viewportNode.scrollLeft = Math.max(0, anchorX * scaleRatio - pointerOffsetX);
      viewportNode.scrollTop = Math.max(0, anchorY * scaleRatio - pointerOffsetY);
    });
  };

  const isBusy =
    importingResumePdf ||
    importingJdImage ||
    parsingResume ||
    generating ||
    generatingDraftJson ||
    branchOptimizing;

  const stepMeta: Record<Step, { title: string; description: string }> = {
    1: {
      title: "导入简历信息",
      description: "左侧上传简历，右侧上传岗位 JD 截图。",
    },
    2: {
      title: "导入岗位 JD",
      description: "该步骤已合并到第一页的双上传区。",
    },
    3: {
      title: "附加材料预选",
      description:
        "这里先预留 Cover Letter 和 Boss 直聘打招呼语的模板方向。后台会继续完成隐藏生成步骤，你确认后再进入左右分屏。",
    },
    4: {
      title: "岗位匹配补充",
      description: "先补充 Gap API 识别出的关键差距，并把它们手动分发到对应经历。提交后系统会自动完成相关经历的优化。",
    },
    5: {
      title: "Draft JSON 结果",
      description: "这里保留为内部过渡步骤，当前不对用户展示。",
    },
    6: {
      title: "聊天样式确认流",
      description: "左侧按聊天样式逐板块确认，右侧只展示已经采用的内容。这里展示的是 Gap 分发与自动优化后的结果。",
    },
    7: {
      title: "投递材料导出",
      description: "选择你要生成或导出的内容，当前排版会自动沿用右侧预览设置。",
    },
  };

  const meta = stepMeta[currentStep];
  const currentUnit = confirmationQueue[currentUnitIndex];
  const branchUnit = useMemo(
    () => (branchUnitId ? confirmationQueue.find((unit) => unit.id === branchUnitId) ?? null : null),
    [confirmationQueue, branchUnitId],
  );
  const overviewUnitsBySection = useMemo(
    () => ({
      basic_info: confirmationQueue.filter((unit) => unit.sectionKey === "basic_info"),
      education: confirmationQueue.filter((unit) => unit.sectionKey === "education"),
      internships: confirmationQueue.filter((unit) => unit.sectionKey === "internships"),
      projects: confirmationQueue.filter((unit) => unit.sectionKey === "projects"),
      other_experiences: confirmationQueue.filter((unit) => unit.sectionKey === "other_experiences"),
      skills: confirmationQueue.filter((unit) => unit.sectionKey === "skills"),
      personal_advantages: confirmationQueue.filter((unit) => unit.sectionKey === "personal_advantages"),
    }),
    [confirmationQueue],
  );
  const gapAssignableUnits = useMemo(
    () =>
      draftJsonState
        ? confirmationQueue
            .filter(
              (
                unit,
              ): unit is Extract<
                ConfirmationUnit,
                { sectionKey: "internships" | "projects" | "other_experiences" }
              > => isOptimizableSection(unit.sectionKey),
            )
            .map((unit) => ({
              unit,
              title: buildBranchTitle(unit, draftJsonState),
            }))
        : [],
    [confirmationQueue, draftJsonState],
  );
  const branchMessages = useMemo(
    () => (branchUnitId ? branchMessageHistory[branchUnitId] ?? [] : []),
    [branchMessageHistory, branchUnitId],
  );
  const activeBranchPlanningState = useMemo(
    () => (branchUnitId ? branchPlanningStates[branchUnitId] ?? null : null),
    [branchPlanningStates, branchUnitId],
  );
  const activeBranchPlanningPreviewDraft = useMemo(() => {
    if (!branchUnit || !draftJsonState) {
      return null;
    }

    const sourceVersion =
      branchSourceVersions[branchUnit.id] ??
      pendingOptimizations[branchUnit.id] ??
      getOptimizableItemFromDraftJson(draftJsonState, branchUnit);

    if (!sourceVersion) {
      return null;
    }

    return applyOptimizedItemToDraftJson(draftJsonState, branchUnit, sourceVersion);
  }, [branchUnit, branchSourceVersions, pendingOptimizations, draftJsonState]);
  const handlePreviewChoiceChange = useCallback(
    <
      K extends "fontSize" | "fontFamily" | "fontWeight" | "margin",
      V extends PreviewSettings[K],
    >(
      key: K,
      value: V,
    ) => {
      setPreviewSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );
  const handlePreviewSliderStep = useCallback((sliderKey: PreviewSliderKey, direction: "decrease" | "increase") => {
    const { min, max, step } = PREVIEW_SLIDER_OPTIONS[sliderKey];

    setPreviewSettings((prev) => {
      const delta = direction === "increase" ? step : -step;
      const nextValue = Math.min(max, Math.max(min, prev[sliderKey] + delta));
      return {
        ...prev,
        [sliderKey]: nextValue,
      };
    });
  }, []);
  const renderOverviewCard = (unit: ConfirmationUnit, options?: { draggable?: boolean }) => {
    const isAccepted = acceptedUnits[unit.id];
    const isRemoved = removedUnits[unit.id];
    const isRecentlyAdopted = recentlyAdoptedUnitId === unit.id;
    const sortable = Boolean(options?.draggable);
    const previewDraftJson = getDraftPreviewWithOptimizedUnit(draftJsonState!, unit, pendingOptimizations[unit.id]);
    const sectionUnits = confirmationQueue.filter((item) => item.sectionKey === unit.sectionKey);
    const isFirstInSection = unit.itemIndex === 0;
    const isLastInSection = unit.itemIndex === sectionUnits.length - 1;

    return (
      <article
        key={unit.id}
        ref={(node) => {
          overviewCardRefs.current[unit.id] = node;
        }}
        className={`rounded-3xl border p-3.5 transition ${
          isRecentlyAdopted
            ? "border-amber-300/80 bg-amber-300/10 shadow-[0_0_0_1px_rgba(252,211,77,0.18)] duration-700"
            : isAccepted
            ? "border-blue-500/40 bg-blue-500/08 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]"
            : isRemoved
              ? "border-slate-200/70 bg-[#eef4ff]/80 opacity-70"
              : "border-slate-200 bg-[#fffefd]/92"
        }`}
      >
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {sortable ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setActiveOverviewSortMenuUnitId((current) => (current === unit.id ? null : unit.id))
                  }
                  className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <DragHandleIcon />
                </button>
                {activeOverviewSortMenuUnitId === unit.id ? (
                  <div
                    onMouseLeave={() => setActiveOverviewSortMenuUnitId(null)}
                    className="absolute left-0 top-full z-20 mt-2 w-28 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.12)]"
                  >
                    <button
                      type="button"
                      onClick={() => handleOverviewMoveUp(unit)}
                      disabled={isFirstInSection}
                      className="flex w-full items-center justify-start rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      上移经历
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOverviewMoveDown(unit)}
                      disabled={isLastInSection}
                      className="flex w-full items-center justify-start rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      下移经历
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOverviewMoveTop(unit)}
                      disabled={isFirstInSection}
                      className="flex w-full items-center justify-start rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      置顶经历
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {buildBranchTitle(unit, previewDraftJson)}
              </h3>
            </div>
          </div>
          {isAccepted ? (
            <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-800">
              已采用
            </span>
          ) : isRemoved ? (
            <span className="rounded-full border border-slate-300/70 bg-[#eef4ff]/90 px-3 py-1 text-xs font-medium text-slate-700">
              已移除
            </span>
          ) : null}
        </div>

        <div
          className={`rounded-2xl border p-2.5 ${
            isRemoved
              ? "border-slate-200/80 bg-white/92 text-slate-600"
              : "border-slate-200 bg-[#f8fbff]/94 text-slate-800"
          }`}
        >
          {renderUnitPreview(unit, previewDraftJson)}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {unit.sectionKey === "basic_info" || unit.sectionKey === "education" ? null : (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-600"
              onClick={() => handleAcceptSection(unit)}
              disabled={isBusy}
            >
              {isAccepted && isRemovableSection(unit.sectionKey) ? "移除经历" : "采用"}
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-blue-500/35 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-600 hover:text-blue-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500"
            onClick={() => handleOpenBranch(unit)}
            disabled={isBusy}
          >
            <span className="mr-2"><EditPencilIcon /></span>
            修改
          </button>
        </div>
      </article>
    );
  };
  const branchQuickActions = useMemo(
    () => (branchUnit && isQuickActionSection(branchUnit.sectionKey) ? BRANCH_QUICK_ACTIONS[branchUnit.sectionKey] : []),
    [branchUnit],
  );
  const previewRenderStyles = useMemo(() => getPreviewRenderStyles(previewSettings), [previewSettings]);
  const previewHorizontalMarginPx = useMemo(
    () => (PREVIEW_A4_WIDTH_PX * PREVIEW_MARGIN_CONFIG[previewSettings.margin].horizontalMm) / 210,
    [previewSettings.margin],
  );
  const previewVerticalMarginPx = useMemo(
    () => (PREVIEW_A4_HEIGHT_PX * previewSettings.verticalMarginMm) / 297,
    [previewSettings.verticalMarginMm],
  );
  const exportPreviewWidthPx = PREVIEW_A4_WIDTH_PX;
  const exportPreviewHeightPx = PREVIEW_A4_HEIGHT_PX;
  const previewStackHeightPx =
    previewPageHeightPx > 0
      ? previewPageHeightPx * previewPageCount + PREVIEW_PAGE_GAP_PX * Math.max(0, previewPageCount - 1)
      : exportPreviewHeightPx;
  const previewEffectiveScale = previewDisplayScale * previewZoom;
  const acceptedPreviewSections = useMemo(
    () =>
      SECTION_ORDER.map((sectionKey) => ({
        sectionKey,
        title: SECTION_LABELS[sectionKey],
        units: confirmationQueue.filter(
          (unit) => unit.sectionKey === sectionKey && acceptedUnits[unit.id],
        ),
      })).filter((section) => section.units.length > 0),
    [acceptedUnits, confirmationQueue],
  );
  const renderPreviewSections = useCallback(
    (options?: { assignRefs?: boolean; highlightActive?: boolean }) => (
      <div className="flex flex-col">
        {acceptedPreviewSections.map((section, sectionIndex) => {
          const [firstUnit, ...restUnits] = section.units;
          const unitGap =
            section.sectionKey === "internships" ||
            section.sectionKey === "projects" ||
            section.sectionKey === "other_experiences"
              ? `${previewSettings.unitGapPx}px`
              : section.sectionKey === "education"
                ? `${PREVIEW_FIXED_EDUCATION_UNIT_GAP_PX}px`
                : "0px";

          const renderSectionUnit = (unit: ConfirmationUnit) => (
            <div
              key={unit.id}
              ref={(node) => {
                if (options?.assignRefs) {
                  previewCardRefs.current[unit.id] = node;
                }
              }}
              className={`rounded-xl transition-all duration-700 ${
                options?.highlightActive && recentlyAdoptedUnitId === unit.id
                  ? "bg-yellow-200/80 ring-2 ring-yellow-300/80 ring-offset-4 ring-offset-white"
                  : ""
              }`}
            >
              {renderUnitPreview(unit, draftJsonState!, previewRenderStyles)}
            </div>
          );

          return (
            <section
              key={`preview-section-${section.sectionKey}`}
              className="flex flex-col"
              style={{
                marginTop:
                  sectionIndex === 0
                    ? 0
                    : `${
                        section.sectionKey === "education" &&
                        acceptedPreviewSections[sectionIndex - 1]?.sectionKey === "basic_info"
                          ? PREVIEW_FIXED_BASIC_EDUCATION_GAP_PX
                          : previewSettings.sectionGapPx
                      }px`,
              }}
            >
              <div className="flex flex-col" style={{ gap: unitGap }}>
                {section.sectionKey !== "basic_info" && firstUnit ? (
                  <div data-preview-break="true" className="space-y-1">
                    <h2
                      className={`border-b border-slate-200 ${PREVIEW_FONT_FAMILY_CLASS[previewSettings.fontFamily]} ${PREVIEW_WEIGHT_CONFIG[previewSettings.fontWeight].section} ${PREVIEW_FONT_SIZE_CLASS[previewSettings.fontSize].section} tracking-wide text-slate-900`}
                      style={{ paddingBottom: "0px" }}
                    >
                      {section.title}
                    </h2>
                    {renderSectionUnit(firstUnit)}
                  </div>
                ) : section.sectionKey !== "basic_info" ? (
                  <h2
                    className={`border-b border-slate-200 ${PREVIEW_FONT_FAMILY_CLASS[previewSettings.fontFamily]} ${PREVIEW_WEIGHT_CONFIG[previewSettings.fontWeight].section} ${PREVIEW_FONT_SIZE_CLASS[previewSettings.fontSize].section} tracking-wide text-slate-900`}
                    style={{ paddingBottom: "0px" }}
                  >
                    {section.title}
                  </h2>
                ) : null}
                {section.sectionKey === "basic_info" && firstUnit ? renderSectionUnit(firstUnit) : null}
                {restUnits.map((unit) => renderSectionUnit(unit))}
              </div>
            </section>
          );
        })}
      </div>
    ),
    [acceptedPreviewSections, draftJsonState, previewRenderStyles, previewSettings, recentlyAdoptedUnitId],
  );
  const previewLayoutBlocks = useMemo<PreviewLayoutBlockDescriptor[]>(() => {
    if (!draftJsonState) {
      return [];
    }

    return acceptedPreviewSections.flatMap((section, sectionIndex) => {
      const blocks: PreviewLayoutBlockDescriptor[] = [];
      const sectionTopPaddingPx =
        sectionIndex === 0
          ? 0
          : section.sectionKey === "education" &&
              acceptedPreviewSections[sectionIndex - 1]?.sectionKey === "basic_info"
            ? PREVIEW_FIXED_BASIC_EDUCATION_GAP_PX
            : previewSettings.sectionGapPx;
      const unitTopPaddingPx =
        section.sectionKey === "internships" ||
        section.sectionKey === "projects" ||
        section.sectionKey === "other_experiences"
          ? previewSettings.unitGapPx
          : section.sectionKey === "education"
            ? PREVIEW_FIXED_EDUCATION_UNIT_GAP_PX
            : 0;

      if (section.sectionKey !== "basic_info") {
        blocks.push({
          id: `section-title-${section.sectionKey}`,
          unitId: `section-${section.sectionKey}`,
          sectionKey: section.sectionKey,
          kind: "section-title",
          keepTogether: true,
          content: (
            <div style={{ paddingTop: `${sectionTopPaddingPx}px` }}>
              <h2
                className={`border-b border-slate-200 ${PREVIEW_FONT_FAMILY_CLASS[previewSettings.fontFamily]} ${PREVIEW_WEIGHT_CONFIG[previewSettings.fontWeight].section} ${PREVIEW_FONT_SIZE_CLASS[previewSettings.fontSize].section} tracking-wide text-slate-900`}
                style={{ paddingBottom: "0px" }}
              >
                {section.title}
              </h2>
            </div>
          ),
        });
      }

      if (section.sectionKey === "basic_info" && section.units[0]) {
        blocks.push({
          id: `${section.units[0].id}-block`,
          unitId: section.units[0].id,
          sectionKey: section.sectionKey,
          kind: "paragraph",
          keepTogether: true,
          content: (
            <div style={{ paddingTop: `${sectionTopPaddingPx}px` }}>
              {renderUnitPreview(section.units[0], draftJsonState, previewRenderStyles)}
            </div>
          ),
        });
      }

      section.units.forEach((unit, unitIndex) => {
        if (section.sectionKey === "basic_info") {
          return;
        }

        const kind: LayoutBlockKind =
          section.sectionKey === "skills"
            ? "skill-line"
            : section.sectionKey === "personal_advantages"
              ? "paragraph"
              : "meta-row";

        blocks.push({
          id: `${unit.id}-block`,
          unitId: unit.id,
          sectionKey: section.sectionKey,
          kind,
          keepTogether: section.sectionKey !== "personal_advantages",
          content: (
            <div style={{ paddingTop: `${unitIndex === 0 ? 4 : unitTopPaddingPx}px` }}>
              {renderUnitPreview(unit, draftJsonState, previewRenderStyles)}
            </div>
          ),
        });
      });

      return blocks;
    });
  }, [acceptedPreviewSections, draftJsonState, previewRenderStyles, previewSettings]);
  const previewLayoutBlockMap = useMemo(
    () => Object.fromEntries(previewLayoutBlocks.map((block) => [block.id, block])),
    [previewLayoutBlocks],
  );
  const previewMeasuredBlockMap = useMemo(
    () => Object.fromEntries(previewMeasuredBlocks.map((block) => [block.id, block])),
    [previewMeasuredBlocks],
  );
  const previewPaginatedPageCount = Math.max(previewPages.length, 1);
  const previewPaginatedBodyHeightPx = Math.max(
    1,
    Math.round(exportPreviewHeightPx - previewVerticalMarginPx * 2),
  );
  const previewSinglePageOverflow = useMemo(() => {
    const bodyBottom = previewPaginatedBodyHeightPx;

    if (previewMeasuredBlocks.length === 0) {
      return {
        hasOverflow: false,
        signature: "",
        totalOverflowPx: 0,
        truncatedSections: [] as string[],
        hiddenSections: [] as string[],
      };
    }

    const overflowingBlocks = previewMeasuredBlocks.filter((block) => block.bottom > bodyBottom + 1);
    const truncatedBlocks = previewMeasuredBlocks.filter(
      (block) => block.top < bodyBottom - 1 && block.bottom > bodyBottom + 1,
    );
    const hiddenBlocks = previewMeasuredBlocks.filter((block) => block.top >= bodyBottom - 1);
    const mapToSectionTitle = (block: MeasuredBlock) =>
      SECTION_LABELS[block.sectionKey as SectionKey] ?? block.sectionKey;

    const truncatedSections = Array.from(new Set(truncatedBlocks.map(mapToSectionTitle)));
    const hiddenSections = Array.from(new Set(hiddenBlocks.map(mapToSectionTitle)));
    const maxBottom = Math.max(
      previewContentHeightPx,
      ...previewMeasuredBlocks.map((block) => block.bottom),
    );
    const totalOverflowPx = Math.max(0, maxBottom - bodyBottom);
    const signature = JSON.stringify({
      truncatedSections,
      hiddenSections,
      totalOverflowPx,
      layout: previewMeasuredBlocks.map((block) => ({
        id: block.id,
        top: block.top,
        bottom: block.bottom,
        height: block.height,
      })),
    });

    return {
      hasOverflow: overflowingBlocks.length > 0 || previewContentHeightPx > bodyBottom + 1,
      signature,
      totalOverflowPx,
      truncatedSections,
      hiddenSections,
    };
  }, [previewContentHeightPx, previewMeasuredBlocks, previewPaginatedBodyHeightPx]);
  const previewPaginatedStackHeightPx =
    exportPreviewHeightPx * previewPaginatedPageCount +
    PREVIEW_PAGE_GAP_PX * Math.max(0, previewPaginatedPageCount - 1);
  const renderPaginatedPreviewItem = useCallback(
    (
      item: ResumePage["items"][number],
      pageIndex: number,
      itemIndex: number,
    ) => {
      const descriptor = previewLayoutBlockMap[item.blockId];
      const measuredBlock = previewMeasuredBlockMap[item.blockId];

      if (!descriptor || !measuredBlock) {
        return null;
      }

      const highlightClass =
        recentlyAdoptedUnitId === descriptor.unitId
          ? "bg-yellow-200/80 ring-2 ring-yellow-300/80 ring-offset-4 ring-offset-white"
          : "";

      const assignPreviewRef = (node: HTMLDivElement | null) => {
        if (itemIndex === 0) {
          previewCardRefs.current[descriptor.unitId] = node;
        }
      };

      if (item.type === "whole") {
        return (
          <div
            key={`${pageIndex}-${item.blockId}`}
            ref={assignPreviewRef}
            className={`rounded-xl transition-all duration-700 ${highlightClass}`}
          >
            {descriptor.content}
          </div>
        );
      }

      const chunkHeight = estimateSplitItemHeight(item, measuredBlock);
      const firstLine = measuredBlock.lines[item.lineStart];
      const offsetTop = firstLine ? firstLine.top - measuredBlock.top : 0;

      return (
        <div
          key={`${pageIndex}-${item.blockId}-${item.lineStart}-${item.lineEnd}`}
          ref={assignPreviewRef}
          className={`rounded-xl transition-all duration-700 ${highlightClass}`}
        >
          <div
            className="overflow-hidden"
            style={{ height: `${chunkHeight}px` }}
          >
            <div style={{ transform: `translateY(-${offsetTop}px)` }}>
              {descriptor.content}
            </div>
          </div>
        </div>
      );
    },
    [previewLayoutBlockMap, previewMeasuredBlockMap, recentlyAdoptedUnitId],
  );
  const branchHasRequiredPlaceholder = /【请输入[^】]+】/.test(branchInput);
  const branchInputLocked =
    branchOptimizing || Boolean(activeBranchPlanningState?.lockInput);
  const hasAcceptedPreview = confirmationQueue.some((unit) => acceptedUnits[unit.id]);
  const allWorkflowTemplates = useMemo(
    () => [...COVER_LETTER_TEMPLATE_PLACEHOLDERS, ...GREETING_TEMPLATE_PLACEHOLDERS],
    [],
  );
  const previewTemplate = useMemo(
    () => allWorkflowTemplates.find((template) => template.id === previewTemplateId) ?? null,
    [allWorkflowTemplates, previewTemplateId],
  );
  const selectedGreetingWorkflowTemplate = useMemo(
    () => GREETING_TEMPLATE_PLACEHOLDERS.find((template) => template.id === selectedGreetingTemplateId) ?? null,
    [selectedGreetingTemplateId],
  );
  const selectedCoverLetterWorkflowTemplate = useMemo(
    () => COVER_LETTER_TEMPLATE_PLACEHOLDERS.find((template) => template.id === selectedCoverLetterTemplateId) ?? null,
    [selectedCoverLetterTemplateId],
  );
  const generatedResultPreview = useMemo(() => {
    if (generatedResultPreviewKind === "cover-letter") {
      return {
        title: "邮件求职信",
        templateTitle: selectedCoverLetterWorkflowTemplate?.title ?? "未选择",
        content: coverLetterAsset.content,
      };
    }

    if (generatedResultPreviewKind === "boss-greeting") {
      return {
        title: "Boss直聘打招呼语",
        templateTitle: selectedGreetingWorkflowTemplate?.title ?? "未选择",
        content: bossGreetingAsset.content,
      };
    }

    return null;
  }, [
    bossGreetingAsset.content,
    coverLetterAsset.content,
    generatedResultPreviewKind,
    selectedCoverLetterWorkflowTemplate?.title,
    selectedGreetingWorkflowTemplate?.title,
  ]);
  const workflowDraftContext = useMemo(
    () => ({
      jobTitle: workflowTargetRole.trim(),
      internshipDuration: workflowInternshipDuration,
      companyName: workflowCompanyName.trim(),
      selectedGreetingTemplateId,
      selectedCoverLetterTemplateId,
      selectedGreetingSystemPrompt: selectedGreetingWorkflowTemplate?.systemPrompt ?? "",
      selectedCoverLetterSystemPrompt: selectedCoverLetterWorkflowTemplate?.systemPrompt ?? "",
    }),
    [
      selectedCoverLetterTemplateId,
      selectedCoverLetterWorkflowTemplate,
      selectedGreetingTemplateId,
      selectedGreetingWorkflowTemplate,
      workflowCompanyName,
      workflowInternshipDuration,
      workflowTargetRole,
    ],
  );
  const bossGreetingWorkflowKey = useMemo(() => {
    if (
      !parsedJdJson.trim() ||
      !draftResumeJson.trim() ||
      !workflowDraftContext.jobTitle ||
      !workflowDraftContext.selectedGreetingSystemPrompt
    ) {
      return "";
    }

    return JSON.stringify({
      jd: parsedJdJson,
      draft: draftResumeJson,
      jobTitle: workflowDraftContext.jobTitle,
      internshipDuration: workflowDraftContext.internshipDuration,
      companyName: workflowDraftContext.companyName,
      templateId: workflowDraftContext.selectedGreetingTemplateId,
      prompt: workflowDraftContext.selectedGreetingSystemPrompt,
    });
  }, [draftResumeJson, parsedJdJson, workflowDraftContext]);
  const coverLetterWorkflowKey = useMemo(() => {
    if (
      !parsedJdJson.trim() ||
      !draftResumeJson.trim() ||
      !workflowDraftContext.jobTitle ||
      !workflowDraftContext.selectedCoverLetterSystemPrompt
    ) {
      return "";
    }

    return JSON.stringify({
      jd: parsedJdJson,
      draft: draftResumeJson,
      jobTitle: workflowDraftContext.jobTitle,
      internshipDuration: workflowDraftContext.internshipDuration,
      companyName: workflowDraftContext.companyName,
      templateId: workflowDraftContext.selectedCoverLetterTemplateId,
      prompt: workflowDraftContext.selectedCoverLetterSystemPrompt,
    });
  }, [draftResumeJson, parsedJdJson, workflowDraftContext]);
  const isWorkflowFormComplete = Boolean(
    workflowTargetRole.trim() &&
      workflowInternshipDuration &&
      workflowCompanyName.trim(),
  );

  const resizeBranchInput = useCallback(() => {
    const node = branchInputRef.current;
    if (!node) {
      return;
    }

    node.style.height = "auto";
    const computed = window.getComputedStyle(node);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 24;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
    const maxNaturalHeight = lineHeight * 4 + paddingTop + paddingBottom + borderTop + borderBottom;

    node.style.height = `${Math.min(node.scrollHeight, maxNaturalHeight)}px`;
  }, []);
  const branchMessageRounds = useMemo(() => {
    if (branchMessages.length === 0) {
      return [] as Array<{ round: number; messages: ChatMessage[] }>;
    }

    const groups: Array<{ round: number; messages: ChatMessage[] }> = [];
    let currentRound = 1;
    let currentMessages: ChatMessage[] = [];

    branchMessages.forEach((message) => {
      if (message.type === "round-divider") {
        groups.push({ round: currentRound, messages: currentMessages });
        const matchedRound = message.text.match(/第\s*(\d+)\s*轮修改/);
        currentRound = matchedRound ? Number(matchedRound[1]) : currentRound + 1;
        currentMessages = [];
        return;
      }

      currentMessages.push(message);
    });

    groups.push({ round: currentRound, messages: currentMessages });
    return groups;
  }, [branchMessages]);

  useEffect(() => {
    if (!branchUnitId) {
      return;
    }

    const node = branchScrollContainerRef.current;
    if (!node) {
      return;
    }

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      node.scrollTop = node.scrollHeight;
      requestAnimationFrame(() => {
        if (!cancelled) {
          node.scrollTop = node.scrollHeight;
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [branchMessages, branchMessageRounds, branchUnitId]);

  useEffect(() => {
    resizeBranchInput();
  }, [branchInput, resizeBranchInput]);

  useEffect(() => {
    if (currentStep !== 6) {
      return;
    }

    const viewportNode = previewViewportRef.current;
    if (!viewportNode) {
      return;
    }

    const updatePreviewDisplayScale = () => {
      const availableWidth = Math.max(
        1,
        viewportNode.clientWidth - PREVIEW_DISPLAY_HORIZONTAL_PADDING_PX,
      );
      const nextScale = Math.min(
        1,
        Math.max(PREVIEW_MIN_DISPLAY_SCALE, availableWidth / PREVIEW_A4_WIDTH_PX),
      );
      setPreviewDisplayScale(nextScale);
    };

    updatePreviewDisplayScale();

    const observer = new ResizeObserver(updatePreviewDisplayScale);
    observer.observe(viewportNode);
    window.addEventListener("resize", updatePreviewDisplayScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePreviewDisplayScale);
    };
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 6) {
      setPreviewMeasuredBlocks([]);
      setPreviewPages([]);
      return;
    }

    const measureNode = previewMeasureRef.current;
    if (!measureNode || previewLayoutBlocks.length === 0) {
      setPreviewMeasuredBlocks([]);
      setPreviewPages([]);
      return;
    }

    const updatePreviewLayoutPages = () => {
      const measuredBlocks = measureResumeBlocks(measureNode);
      const pageBodyHeight = Math.round(exportPreviewHeightPx - previewVerticalMarginPx * 2);
      const pages = paginateResume({
        blocks: measuredBlocks,
        pageBodyHeight,
        pageTopBuffer: 0,
        pageBottomBuffer: 6,
        minLinesAtPageEnd: 2,
        minLinesAtNextPageStart: 2,
      });

      setPreviewMeasuredBlocks(measuredBlocks);
      setPreviewPages(pages);
    };

    updatePreviewLayoutPages();

    const observer = new ResizeObserver(() => {
      updatePreviewLayoutPages();
    });

    observer.observe(measureNode);

    return () => {
      observer.disconnect();
    };
  }, [currentStep, exportPreviewHeightPx, previewLayoutBlocks, previewVerticalMarginPx]);

  useEffect(() => {
    if ((currentStep !== 5 && currentStep !== 6 && currentStep !== 7) || !draftJsonState) {
      setPreviewPageCount(1);
      setPreviewPageOffsetsPx([0]);
      setPreviewContentHeightPx(0);
      return;
    }

    const updatePreviewPages = () => {
      const contentNode = previewContentRef.current;

      if (!contentNode) {
        return;
      }

      const nextPageHeightPx = Math.round(PREVIEW_A4_HEIGHT_PX);
      const nextVerticalMarginPx = Math.round((nextPageHeightPx * previewSettings.verticalMarginMm) / 297);
      const nextPageBodyHeightPx = Math.max(1, Math.round(nextPageHeightPx - nextVerticalMarginPx * 2));
      const contentHeight = Math.ceil(contentNode.scrollHeight);
      const blockNodes = Array.from(
        contentNode.querySelectorAll<HTMLElement>("[data-preview-break='true']"),
      );
      const contentRect = contentNode.getBoundingClientRect();
      const lineSegments = blockNodes
        .flatMap((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = Array.from(range.getClientRects());
          range.detach?.();

          if (rects.length === 0) {
            const fallbackRect = node.getBoundingClientRect();
            return [
              {
                top: Math.floor(fallbackRect.top - contentRect.top),
                bottom: Math.ceil(fallbackRect.bottom - contentRect.top),
              },
            ];
          }

          return rects.map((rect) => ({
            top: Math.floor(rect.top - contentRect.top),
            bottom: Math.ceil(rect.bottom - contentRect.top),
          }));
        })
        .filter((segment) => segment.bottom - segment.top > 1)
        .sort((a, b) => a.top - b.top);

      const blocks = blockNodes
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            top: Math.floor(rect.top - contentRect.top),
            bottom: Math.ceil(rect.bottom - contentRect.top),
          };
        })
        .filter((block) => block.bottom - block.top > 1)
        .sort((a, b) => a.top - b.top);

      const nextPageOffsets = [0];
      let currentOffset = 0;

      while (currentOffset + nextPageBodyHeightPx < contentHeight - 1) {
        const naturalEnd = Math.floor(currentOffset + nextPageBodyHeightPx);
        const crossingLine = lineSegments.find(
          (segment) => segment.top < naturalEnd - 1 && segment.bottom > naturalEnd + 1,
        );
        const crossingBlock = blocks.find(
          (block) => block.top < naturalEnd - 1 && block.bottom > naturalEnd + 1,
        );

        let nextOffset = naturalEnd;
        if (crossingLine && crossingLine.top > currentOffset + 8) {
          nextOffset = crossingLine.top;
        } else if (crossingBlock && crossingBlock.top > currentOffset + 12) {
          nextOffset = crossingBlock.top;
        }

        nextOffset = Math.floor(nextOffset);

        if (nextOffset <= currentOffset + 2) {
          nextOffset = naturalEnd;
        }

        nextPageOffsets.push(nextOffset);
        currentOffset = nextOffset;
      }

      setPreviewPageHeightPx(nextPageHeightPx);
      setPreviewPageBodyHeightPx(nextPageBodyHeightPx);
      setPreviewPageOffsetsPx(nextPageOffsets);
      setPreviewContentHeightPx(contentHeight);
      setPreviewPageCount(nextPageOffsets.length);
    };

    updatePreviewPages();

    const observer = new ResizeObserver(() => {
      updatePreviewPages();
    });

    if (previewContentRef.current) {
      observer.observe(previewContentRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [acceptedPreviewSections, currentStep, draftJsonState, previewSettings]);

  useEffect(() => {
    if (!recentlyAdoptedUnitId || currentStep !== 6) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      overviewCardRefs.current[recentlyAdoptedUnitId]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      const viewportNode = previewViewportRef.current;
      const previewNode = previewCardRefs.current[recentlyAdoptedUnitId];
      if (viewportNode && previewNode) {
        const viewportRect = viewportNode.getBoundingClientRect();
        const previewRect = previewNode.getBoundingClientRect();
        const topPadding = 48;
        const bottomPadding = 96;
        const isAbove = previewRect.top < viewportRect.top + topPadding;
        const isBelow = previewRect.bottom > viewportRect.bottom - bottomPadding;

        if (isAbove || isBelow) {
          const deltaTop = previewRect.top - viewportRect.top - topPadding;
          const deltaBottom = previewRect.bottom - viewportRect.bottom + bottomPadding;
          const nextScrollTop =
            viewportNode.scrollTop + (isAbove ? deltaTop : deltaBottom);

          viewportNode.scrollTo({
            top: Math.max(0, nextScrollTop),
            behavior: "smooth",
          });
        }
      }
    });

    const timeout = window.setTimeout(() => {
      setRecentlyAdoptedUnitId((current) => (current === recentlyAdoptedUnitId ? null : current));
    }, 1500);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [recentlyAdoptedUnitId, currentStep]);

  useEffect(() => {
    if (!isPreviewToolbarExpanded) {
      setActivePreviewSlider(null);
      return;
    }

    function handleClosePreviewToolbar(event: MouseEvent | globalThis.TouchEvent) {
      const toolbarNode = previewToolbarRef.current;
      if (!toolbarNode) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && toolbarNode.contains(target)) {
        return;
      }

      setIsPreviewToolbarExpanded(false);
    }

    document.addEventListener("mousedown", handleClosePreviewToolbar);
    document.addEventListener("touchstart", handleClosePreviewToolbar);

    return () => {
      document.removeEventListener("mousedown", handleClosePreviewToolbar);
      document.removeEventListener("touchstart", handleClosePreviewToolbar);
    };
  }, [isPreviewToolbarExpanded]);

  useEffect(() => {
    if (currentStep !== 6) {
      setIsPreviewOverflowModalOpen(false);
      return;
    }

    if (!previewSinglePageOverflow.hasOverflow) {
      setPreviewOverflowDismissedSignature(null);
      setIsPreviewOverflowModalOpen(false);
      return;
    }

    if (previewOverflowDismissedSignature === previewSinglePageOverflow.signature) {
      return;
    }

    setIsPreviewOverflowModalOpen(true);
  }, [currentStep, previewOverflowDismissedSignature, previewSinglePageOverflow]);

  useEffect(() => {
    if (currentStep !== 3 || !waitingStepNextRequested || hiddenGenerationStatus !== "success") {
      return;
    }

    setCurrentStep(4);
    setMaxReachedStep(4);
    setWaitingStepNextRequested(false);
  }, [currentStep, hiddenGenerationStatus, waitingStepNextRequested]);

  useEffect(() => {
    if (currentStep === 6) {
      setIsPreviewToolbarExpanded(false);
      setActivePreviewSlider(null);
      setPreviewZoom(PREVIEW_MIN_ZOOM);
      const viewportNode = previewViewportRef.current;
      if (viewportNode) {
        viewportNode.scrollTop = 0;
        viewportNode.scrollLeft = 0;
      }
    }
  }, [currentStep]);

  useEffect(() => {
    if (!bossGreetingWorkflowKey) {
      return;
    }

    if (
      bossGreetingAssetRef.current.requestKey === bossGreetingWorkflowKey &&
      (bossGreetingAssetRef.current.status === "running" || bossGreetingAssetRef.current.status === "success")
    ) {
      return;
    }

    let cancelled = false;

    setBossGreetingAsset((prev) => ({
      ...prev,
      status: "running",
      error: "",
      requestKey: bossGreetingWorkflowKey,
    }));

    void (async () => {
      try {
        const parsedJd = parseStoredJsonOrThrow(parsedJdJson, "JD JSON");
        const parsedDraft = parseStoredJsonOrThrow(draftResumeJson, "Draft JSON");
        const result = await generateBossGreeting(parsedJd, parsedDraft, {
          jobTitle: workflowDraftContext.jobTitle,
          internshipDuration: workflowDraftContext.internshipDuration,
          companyName: workflowDraftContext.companyName,
          systemPrompt: workflowDraftContext.selectedGreetingSystemPrompt,
        });

        if (cancelled) {
          return;
        }

        setBossGreetingAsset({
          status: "success",
          content: result,
          error: "",
          requestKey: bossGreetingWorkflowKey,
        });
      } catch (err) {
        if (cancelled) {
          return;
        }

        setBossGreetingAsset({
          status: "error",
          content: "",
          error: err instanceof Error ? err.message : "Boss 打招呼语生成失败",
          requestKey: bossGreetingWorkflowKey,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bossGreetingWorkflowKey,
    draftResumeJson,
    parsedJdJson,
    workflowDraftContext,
  ]);

  useEffect(() => {
    if (!coverLetterWorkflowKey) {
      return;
    }

    if (
      coverLetterAssetRef.current.requestKey === coverLetterWorkflowKey &&
      (coverLetterAssetRef.current.status === "running" || coverLetterAssetRef.current.status === "success")
    ) {
      return;
    }

    let cancelled = false;

    setCoverLetterAsset((prev) => ({
      ...prev,
      status: "running",
      error: "",
      requestKey: coverLetterWorkflowKey,
    }));

    void (async () => {
      try {
        const parsedJd = parseStoredJsonOrThrow(parsedJdJson, "JD JSON");
        const parsedDraft = parseStoredJsonOrThrow(draftResumeJson, "Draft JSON");
        const result = await generateCoverLetter(parsedJd, parsedDraft, {
          jobTitle: workflowDraftContext.jobTitle,
          internshipDuration: workflowDraftContext.internshipDuration,
          companyName: workflowDraftContext.companyName,
          systemPrompt: workflowDraftContext.selectedCoverLetterSystemPrompt,
        });

        if (cancelled) {
          return;
        }

        setCoverLetterAsset({
          status: "success",
          content: result,
          error: "",
          requestKey: coverLetterWorkflowKey,
        });
      } catch (err) {
        if (cancelled) {
          return;
        }

        setCoverLetterAsset({
          status: "error",
          content: "",
          error: err instanceof Error ? err.message : "邮件求职信生成失败",
          requestKey: coverLetterWorkflowKey,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    coverLetterWorkflowKey,
    draftResumeJson,
    parsedJdJson,
    workflowDraftContext,
  ]);

  const isEducationItemComplete = (item: EducationFormItem) =>
    Boolean(item.school.trim() && item.degree.trim() && item.major.trim() && item.startDate.trim() && item.endDate.trim());

  const isInternshipItemComplete = (item: ExperienceFormItem) =>
    Boolean(
      item.company.trim() &&
        item.role.trim() &&
        item.startDate.trim() &&
        item.endDate.trim() &&
        splitTextAreaLines(item.bullets).length > 0,
    );

  const isProjectItemComplete = (item: ProjectFormItem) =>
    Boolean(
      item.name.trim() &&
        item.role.trim() &&
        item.startDate.trim() &&
        item.endDate.trim() &&
        splitTextAreaLines(item.bullets).length > 0,
    );

  const isOtherExperienceItemComplete = (item: OtherExperienceFormItem) =>
    Boolean(
      item.type.trim() &&
        item.name.trim() &&
        item.role.trim() &&
        item.startDate.trim() &&
        item.endDate.trim() &&
        splitTextAreaLines(item.bullets).length > 0,
    );

  const hasAtLeastOneExperience =
    resumeForm.internships.some(isInternshipItemComplete) ||
    resumeForm.projects.some(isProjectItemComplete) ||
    resumeForm.otherExperiences.some(isOtherExperienceItemComplete);

  const shouldHighlightExperienceRequired = resumeValidationAttempted && !hasAtLeastOneExperience;

  const isResumeFormReady =
    resumeForm.basicInfo.name.trim().length > 0 &&
    resumeForm.basicInfo.phone.trim().length > 0 &&
    resumeForm.basicInfo.email.trim().length > 0 &&
    resumeForm.education.every(isEducationItemComplete) &&
    hasAtLeastOneExperience;

  const isJdReady = parsedJdJson.trim().length > 0;
  const canProceedFromStepOne = !isBusy;

  return (
    <main
      className={`relative px-4 text-slate-900 [&_input]:bg-white [&_select]:bg-white [&_textarea]:bg-white ${
        currentStep === 6 ? "h-screen overflow-hidden py-3" : currentStep === 7 ? "h-screen overflow-hidden py-10" : "min-h-screen py-10"
      }`}
    >
      <div className="site-aurora-bg" aria-hidden="true" />
      <div
        className={`relative z-10 mx-auto flex w-full flex-col gap-6 ${
          currentStep === 1 || currentStep === 3 || currentStep === 4 || currentStep === 7
            ? "max-w-[min(1240px,calc(100vw-6rem))]"
            : "max-w-[min(1800px,calc(100vw-2rem))]"
        } ${currentStep === 6 || currentStep === 7 ? "h-full" : ""}`}
      >
        <section
          className={`rounded-3xl border border-slate-200 bg-[#f7faff]/96 shadow-2xl shadow-blue-200/60 backdrop-blur ${
            currentStep === 6
              ? "flex min-h-0 flex-1 flex-col overflow-hidden p-3"
              : currentStep === 7
                ? "flex min-h-0 flex-1 flex-col overflow-hidden border-b-slate-300/80 p-6 shadow-[0_22px_48px_rgba(15,23,42,0.08)]"
                : "p-6"
          }`}
        >
          {currentStep === 1 || currentStep === 3 || currentStep === 4 || currentStep === 7 ? null : (
            <div className={`flex items-center justify-between gap-4 ${currentStep === 6 ? "mb-1" : "mb-6"}`}>
              <div className="flex flex-wrap items-center gap-2">
                {currentStep === 6 ? (
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    {visibleSteps.map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => {
                          if (isStepReached(step)) {
                            setCurrentStep(step as Step);
                            setError("");
                          }
                        }}
                        className={`rounded-full border px-3 py-1 ${
                          currentStep === step
                            ? "border-blue-500/50 bg-blue-500/10 text-blue-800"
                            : isStepReached(step)
                              ? "border-slate-300 bg-white/92 text-slate-700 transition hover:border-blue-500/40 hover:text-blue-800"
                              : "cursor-not-allowed border-slate-300 bg-white/82 text-slate-500"
                        }`}
                      >
                        {getVisibleStepNumber(step)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="inline-flex rounded-full border border-slate-300 bg-white/92 p-1 text-sm">
                    <button
                      type="button"
                      onClick={() => setViewMode("user")}
                      className={`rounded-full px-4 py-2 transition ${
                        viewMode === "user" ? "bg-blue-500 text-white" : "text-slate-700 hover:text-slate-950"
                      }`}
                    >
                      用户模式
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("debug")}
                      className={`rounded-full px-4 py-2 transition ${
                        viewMode === "debug" ? "bg-blue-500 text-white" : "text-slate-700 hover:text-slate-950"
                      }`}
                    >
                      Debug 模式
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 6 ? null : (
            <div className="mb-6 space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-blue-700/80">{`Step ${getVisibleStepNumber(
                currentStep,
              )}`}</p>
              <h1 className="text-3xl font-semibold tracking-tight">{meta.title}</h1>
            </div>
          )}

          <div className={`flex flex-wrap gap-2 text-xs text-slate-600 ${currentStep === 6 ? "hidden" : "mb-6"}`}>
            {visibleSteps.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => {
                  if (isStepReached(step)) {
                    setCurrentStep(step as Step);
                    setError("");
                  }
                }}
                className={`rounded-full border px-3 py-1 ${
                  currentStep === step
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-800"
                    : isStepReached(step)
                      ? "border-slate-300 bg-white/92 text-slate-700 transition hover:border-blue-500/40 hover:text-blue-800"
                      : "cursor-not-allowed border-slate-300 bg-white/82 text-slate-500"
                }`}
              >
                {getVisibleStepNumber(step)}
              </button>
            ))}
          </div>

          {currentStep === 1 ? (
            <div className="space-y-0">
              <section className="space-y-10">
                <div className="grid gap-6 border-b border-slate-200/80 pb-10 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8">
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <p className="text-2xl font-semibold tracking-tight text-slate-900">简历导入</p>
                      <div className="h-1 w-10 rounded-full bg-blue-500" />
                    </div>
                  </div>
                  <div
                  className={`rounded-3xl border border-dashed p-6 text-center transition lg:ml-2 ${
                    isDragActive
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-200 bg-white"
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={openResumeFilePicker}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openResumeFilePicker();
                    }
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!importingResumePdf) {
                      setIsDragActive(true);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "copy";
                    if (!importingResumePdf) {
                      setIsDragActive(true);
                    }
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      return;
                    }
                    setIsDragActive(false);
                  }}
                  onDrop={handleResumeDrop}
                >
                  <p className="text-lg font-semibold text-slate-900">把你的简历拖拽到此处</p>
                  <p className="mt-3 text-sm leading-7 text-slate-500">
                    支持 PDF 识别自动预填，也支持你直接手动填写下面的表单。
                  </p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openResumeFilePicker();
                    }}
                    className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-full border border-blue-500/50 px-5 py-2.5 text-sm font-semibold text-blue-600 transition hover:border-blue-600 hover:text-blue-700"
                  >
                    {importingResumePdf ? "识别中..." : "选择文件"}
                  </button>
                  <input
                    ref={resumeFileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleResumeFileSelect}
                    disabled={importingResumePdf}
                  />
	                  <p className="mt-4 text-xs tracking-wide text-slate-400">
	                    {importingResumePdf
	                      ? `正在识别：${uploadedResumeFileName}`
	                      : uploadedResumeFileName
	                        ? parsedResumeJson.trim().length > 0
	                          ? `已完成解析：${uploadedResumeFileName}`
	                          : `已选择文件：${uploadedResumeFileName}`
	                        : "支持 PDF 拖拽 / 文件选择导入"}
	                  </p>
	                </div>
	                </div>
	
	                <div className="grid gap-6 border-b border-slate-200/80 pb-10 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8">
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <p className="text-2xl font-semibold tracking-tight text-slate-900">岗位JD导入</p>
                      <div className="h-1 w-10 rounded-full bg-blue-500" />
                    </div>
                  </div>
                  <div
                  className={`rounded-3xl border border-dashed p-6 text-center transition lg:ml-2 ${
                    isJdImageDragActive
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-slate-200 bg-white"
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={openJdImageFilePicker}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openJdImageFilePicker();
                    }
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!importingJdImage) {
                      setIsJdImageDragActive(true);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "copy";
                    if (!importingJdImage) {
                      setIsJdImageDragActive(true);
                    }
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      return;
                    }
                    setIsJdImageDragActive(false);
                  }}
                  onDrop={handleJdImageDrop}
                >
                  <p className="text-lg font-semibold text-slate-900">把岗位 JD 截图拖拽到此处</p>
                  <p className="mt-3 text-sm leading-7 text-slate-500">
                    支持 PNG / JPG / JPEG / WEBP，上传后会在后台自动识别。
                  </p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openJdImageFilePicker();
                    }}
                    className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-full border border-blue-500/50 px-5 py-2.5 text-sm font-semibold text-blue-600 transition hover:border-blue-600 hover:text-blue-700"
                  >
                    {importingJdImage ? "识别中..." : "选择图片"}
                  </button>
                  <input
                    ref={jdImageFileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleJdImageFileSelect}
                    disabled={importingJdImage}
                  />
	                  <p className="mt-4 text-xs tracking-wide text-slate-400">
	                    {importingJdImage
	                      ? `正在识别：${uploadedJdImageFileName}`
	                      : uploadedJdImageFileName
	                        ? isJdReady
	                          ? `已完成解析：${uploadedJdImageFileName}`
	                          : `已选择图片：${uploadedJdImageFileName}`
	                        : "支持图片拖拽 / 文件选择导入"}
	                  </p>
	                </div>
	                </div>
	              </section>

              <div className="space-y-0">
                  <section
                    id="intake-basicInfo"
                    className="grid gap-6 border-b border-slate-200/80 py-10 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8"
                  >
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1">
                        <p className="text-2xl font-semibold tracking-tight text-slate-900">基础信息</p>
                        <div className="h-1 w-10 rounded-full bg-blue-500" />
                      </div>
                    </div>
                    <div className="grid gap-5 lg:pl-2">
                      <label className="flex flex-col gap-2 text-sm text-slate-700">
                        姓名 *
                        <input
                          className={getInputClassName(resumeValidationAttempted && !resumeForm.basicInfo.name.trim())}
                          value={resumeForm.basicInfo.name}
                          onChange={(event) => updateBasicInfo("name", event.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-slate-700">
                        手机号 *
                        <input
                          className={getInputClassName(resumeValidationAttempted && !resumeForm.basicInfo.phone.trim())}
                          value={resumeForm.basicInfo.phone}
                          onChange={(event) => updateBasicInfo("phone", event.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-slate-700">
                        邮箱 *
                        <input
                          className={getInputClassName(resumeValidationAttempted && !resumeForm.basicInfo.email.trim())}
                          value={resumeForm.basicInfo.email}
                          onChange={(event) => updateBasicInfo("email", event.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-slate-700">
                        意向岗位
                        <input
                          className="rounded-2xl border border-slate-300 bg-[#f7faff]/96 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          value={resumeForm.basicInfo.targetRole}
                          onChange={(event) => updateBasicInfo("targetRole", event.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-slate-700">
                        作品集
                        <input
                          className={getInputClassName()}
                          placeholder="请提供链接 URL"
                          value={resumeForm.basicInfo.portfolio}
                          onChange={(event) => updateBasicInfo("portfolio", event.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-slate-700">
                        GitHub
                        <input
                          className={getInputClassName()}
                          placeholder="请提供 GitHub 链接 URL"
                          value={resumeForm.basicInfo.github}
                          onChange={(event) => updateBasicInfo("github", event.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm text-slate-700">
                        政治面貌
                        <select
                          className="rounded-2xl border border-slate-300 bg-[#f7faff]/96 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          value={resumeForm.basicInfo.politicalStatus}
                          onChange={(event) => updateBasicInfo("politicalStatus", event.target.value)}
                        >
                          <option value="">请选择</option>
                          {POLITICAL_STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>

                  <section
                    id="intake-education"
                    className={`grid gap-6 border-b py-10 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8 ${
                      resumeValidationAttempted &&
                      !resumeForm.education.some(
                        (item) => item.school.trim() && item.degree.trim() && item.major.trim() && item.startDate.trim() && item.endDate.trim(),
                      )
                        ? "border-rose-400/70"
                        : "border-slate-200/80"
                    }`}
                  >
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1">
                        <p className="text-2xl font-semibold tracking-tight text-slate-900">教育背景</p>
                        <div className="h-1 w-10 rounded-full bg-blue-500" />
                      </div>
                    </div>
                    <div className="space-y-8 lg:pl-2">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setResumeForm((prev) => ({ ...prev, education: [...prev.education, createEducationItem()] }))}
                        className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                      >
                        + 添加
                      </button>
                    </div>
                    {resumeForm.education.map((item, index) => (
                      <div key={`education-${index}`} className="space-y-6 rounded-[28px] bg-[#f8fbff]/70 px-6 py-6">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800">教育背景 {index + 1}</p>
                          {resumeForm.education.length > 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setResumeForm((prev) => ({
                                  ...prev,
                                  education: prev.education.filter((_, itemIndex) => itemIndex !== index),
                                }))
                              }
                              aria-label="删除教育背景"
                              title="删除教育背景"
                              className="rounded-full p-1 text-rose-300 transition hover:bg-rose-50 hover:text-rose-400"
                            >
                              <TrashIcon />
                            </button>
                          ) : null}
                        </div>
                        <div className="grid gap-5">
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            学校名称 *
                            <input
                              className={getInputClassName(resumeValidationAttempted && !item.school.trim(), "dark")}
                              value={item.school}
                              onChange={(event) =>
                                updateArrayItem<EducationFormItem>("education", index, (draft) => ({ ...draft, school: event.target.value }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            学历 *
                            <select
                              className={getInputClassName(resumeValidationAttempted && !item.degree.trim(), "dark")}
                              value={item.degree}
                              onChange={(event) =>
                                updateArrayItem<EducationFormItem>("education", index, (draft) => ({ ...draft, degree: event.target.value }))
                              }
                            >
                              <option value="">请选择</option>
                              {DEGREE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            专业 *
                            <input
                              className={getInputClassName(resumeValidationAttempted && !item.major.trim(), "dark")}
                              value={item.major}
                              onChange={(event) =>
                                updateArrayItem<EducationFormItem>("education", index, (draft) => ({ ...draft, major: event.target.value }))
                              }
                            />
                          </label>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">起止时间 *</p>
                            <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
                            <label className="flex flex-col gap-2 text-sm text-slate-700">
                              开始时间 *
                              <input
                                type="month"
                                className={getInputClassName(resumeValidationAttempted && !item.startDate.trim(), "dark")}
                                value={item.startDate}
                                onChange={(event) =>
                                  updateArrayItem<EducationFormItem>("education", index, (draft) => ({ ...draft, startDate: event.target.value }))
                                }
                              />
                            </label>
                            <div className="pt-8 text-center text-lg text-slate-400">-</div>
                            <label className="flex flex-col gap-2 text-sm text-slate-700">
                              结束时间 *
                              <input
                                type="month"
                                className={getInputClassName(resumeValidationAttempted && !item.endDate.trim(), "dark")}
                                value={item.endDate}
                                onChange={(event) =>
                                  updateArrayItem<EducationFormItem>("education", index, (draft) => ({ ...draft, endDate: event.target.value }))
                                }
                              />
                            </label>
                            </div>
                          </div>
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            GPA
                            <input
                              className="rounded-2xl border border-slate-300 bg-white/92 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                              value={item.gpa}
                              onChange={(event) =>
                                updateArrayItem<EducationFormItem>("education", index, (draft) => ({ ...draft, gpa: event.target.value }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            年级排名
                            <select
                              className="rounded-2xl border border-slate-300 bg-white/92 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                              value={item.ranking}
                              onChange={(event) =>
                                updateArrayItem<EducationFormItem>("education", index, (draft) => ({ ...draft, ranking: event.target.value }))
                              }
                            >
                              <option value="">请选择</option>
                              {RANKING_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">主修课程</p>
                            {item.courses.map((course, listIndex) => (
                              <div key={`course-${index}-${listIndex}`} className="flex gap-3">
                                <input
                                  className="flex-1 rounded-2xl border border-slate-300 bg-white/92 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                  value={course}
                                  onChange={(event) =>
                                    updateStringListField("education", index, listIndex, event.target.value)
                                  }
                                />
                                {item.courses.length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateArrayItem<EducationFormItem>("education", index, (draft) => ({
                                        ...draft,
                                        courses: draft.courses.filter((_, currentIndex) => currentIndex !== listIndex),
                                      }))
                                    }
                                    aria-label="删除课程"
                                    title="删除课程"
                                    className="rounded-2xl border border-slate-300 px-3 text-slate-700 transition hover:border-rose-300 hover:text-rose-400"
                                  >
                                    <TrashIcon />
                                  </button>
                                ) : null}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                updateArrayItem<EducationFormItem>("education", index, (draft) => ({
                                  ...draft,
                                  courses: [...draft.courses, ""],
                                }))
                              }
                              className="text-sm font-semibold text-blue-700 transition hover:text-blue-900"
                            >
                              + 添加课程
                            </button>
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">荣誉 / 奖学金</p>
                            {item.honors.map((honor, listIndex) => (
                              <div key={`honor-${index}-${listIndex}`} className="flex gap-3">
                                <input
                                  className="flex-1 rounded-2xl border border-slate-300 bg-white/92 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                  value={honor}
                                  onChange={(event) =>
                                    updateStringListField("education-honors", index, listIndex, event.target.value)
                                  }
                                />
                                {item.honors.length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateArrayItem<EducationFormItem>("education", index, (draft) => ({
                                        ...draft,
                                        honors: draft.honors.filter((_, currentIndex) => currentIndex !== listIndex),
                                      }))
                                    }
                                    aria-label="删除荣誉"
                                    title="删除荣誉"
                                    className="rounded-2xl border border-slate-300 px-3 text-slate-700 transition hover:border-rose-300 hover:text-rose-400"
                                  >
                                    <TrashIcon />
                                  </button>
                                ) : null}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                updateArrayItem<EducationFormItem>("education", index, (draft) => ({
                                  ...draft,
                                  honors: [...draft.honors, ""],
                                }))
                              }
                              className="text-sm font-semibold text-blue-700 transition hover:text-blue-900"
                            >
                              + 添加荣誉
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    </div>
                  </section>

                  <section
                    id="intake-internships"
                    className={`border-b py-10 ${
                      resumeValidationAttempted && !hasAtLeastOneExperience ? "border-rose-400/70" : "border-slate-200/80"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapse("internships")}
                      className="grid w-full gap-6 text-left lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8"
                    >
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1">
                          <p className="text-2xl font-semibold tracking-tight text-slate-900">实习经历</p>
                          <div className="h-1 w-10 rounded-full bg-blue-500" />
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        {!collapsedSections.internships ? (
                          <div className="pt-1 text-sm leading-6 text-slate-500">实习、兼职都可以放在这里。每段经历至少保留 1 条原始 bullet。</div>
                        ) : (
                          <div />
                        )}
                        <span className="shrink-0 text-sm text-blue-700">{collapsedSections.internships ? "展开" : "收起"}</span>
                      </div>
                    </button>
                    {!collapsedSections.internships ? (
                      <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8">
                        <div />
                        <div className="space-y-8 lg:pl-2">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setResumeForm((prev) => ({ ...prev, internships: [...prev.internships, createExperienceItem()] }))}
                            className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                          >
                            + 添加
                          </button>
                        </div>
                    {resumeForm.internships.map((item, index) => (
                      <div key={`internship-${index}`} className="space-y-6 rounded-[28px] bg-[#f8fbff]/70 px-6 py-6">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800">实习经历 {index + 1}</p>
                          {resumeForm.internships.length > 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setResumeForm((prev) => ({
                                  ...prev,
                                  internships: prev.internships.filter((_, itemIndex) => itemIndex !== index),
                                }))
                              }
                              aria-label="删除实习经历"
                              title="删除实习经历"
                              className="rounded-full p-1 text-rose-300 transition hover:bg-rose-50 hover:text-rose-400"
                            >
                              <TrashIcon />
                            </button>
                          ) : null}
                        </div>
                        <div className="grid gap-5">
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            公司名称 *
                            <input
                              className={getInputClassName(shouldHighlightExperienceRequired && !item.company.trim(), "dark")}
                              value={item.company}
                              onChange={(event) =>
                                updateArrayItem<ExperienceFormItem>("internships", index, (draft) => ({ ...draft, company: event.target.value }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            岗位名称 *
                            <input
                              className={getInputClassName(shouldHighlightExperienceRequired && !item.role.trim(), "dark")}
                              value={item.role}
                              onChange={(event) =>
                                updateArrayItem<ExperienceFormItem>("internships", index, (draft) => ({ ...draft, role: event.target.value }))
                              }
                            />
                          </label>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">起止时间 *</p>
                            <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
                            <label className="flex flex-col gap-2 text-sm text-slate-700">
                              开始时间 *
                              <input
                                type="month"
                                className={getInputClassName(shouldHighlightExperienceRequired && !item.startDate.trim(), "dark")}
                                value={item.startDate}
                                onChange={(event) =>
                                  updateArrayItem<ExperienceFormItem>("internships", index, (draft) => ({ ...draft, startDate: event.target.value }))
                                }
                              />
                            </label>
                            <div className="pt-8 text-center text-lg text-slate-400">-</div>
                            <label className="flex flex-col gap-2 text-sm text-slate-700">
                              结束时间 *
                              <input
                                type="month"
                                className={getInputClassName(shouldHighlightExperienceRequired && !item.endDate.trim(), "dark")}
                                value={item.endDate}
                                onChange={(event) =>
                                  updateArrayItem<ExperienceFormItem>("internships", index, (draft) => ({ ...draft, endDate: event.target.value }))
                                }
                              />
                            </label>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">原始内容 bullet *</p>
                            <textarea
                              className={`min-h-32 w-full ${getInputClassName(
                                shouldHighlightExperienceRequired && splitTextAreaLines(item.bullets).length === 0,
                                "dark",
                              )}`}
                              placeholder="每行输入一条经历内容"
                              value={item.bullets}
                              onChange={(event) =>
                                updateArrayItem<ExperienceFormItem>("internships", index, (draft) => ({ ...draft, bullets: event.target.value }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section
                    id="intake-projects"
                    className={`border-b py-10 ${
                      resumeValidationAttempted && !hasAtLeastOneExperience ? "border-rose-400/70" : "border-slate-200/80"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapse("projects")}
                      className="grid w-full gap-6 text-left lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8"
                    >
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1">
                          <p className="text-2xl font-semibold tracking-tight text-slate-900">项目经历</p>
                          <div className="h-1 w-10 rounded-full bg-blue-500" />
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        {!collapsedSections.projects ? (
                          <div className="pt-1 text-sm leading-6 text-slate-500">每个项目都保留角色、时间和多条原始内容，方便后续 AI 做针对性优化。</div>
                        ) : (
                          <div />
                        )}
                        <span className="shrink-0 text-sm text-blue-700">{collapsedSections.projects ? "展开" : "收起"}</span>
                      </div>
                    </button>
                    {!collapsedSections.projects ? (
                      <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8">
                        <div />
                        <div className="space-y-8 lg:pl-2">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setResumeForm((prev) => ({ ...prev, projects: [...prev.projects, createProjectItem()] }))}
                            className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                          >
                            + 添加
                          </button>
                        </div>
                    {resumeForm.projects.map((item, index) => (
                      <div key={`project-${index}`} className="space-y-6 rounded-[28px] bg-[#f8fbff]/70 px-6 py-6">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800">项目经历 {index + 1}</p>
                          {resumeForm.projects.length > 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setResumeForm((prev) => ({
                                  ...prev,
                                  projects: prev.projects.filter((_, itemIndex) => itemIndex !== index),
                                }))
                              }
                              aria-label="删除项目经历"
                              title="删除项目经历"
                              className="rounded-full p-1 text-rose-300 transition hover:bg-rose-50 hover:text-rose-400"
                            >
                              <TrashIcon />
                            </button>
                          ) : null}
                        </div>
                        <div className="grid gap-5">
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            项目名称 *
                            <input
                              className={getInputClassName(shouldHighlightExperienceRequired && !item.name.trim(), "dark")}
                              value={item.name}
                              onChange={(event) =>
                                updateArrayItem<ProjectFormItem>("projects", index, (draft) => ({ ...draft, name: event.target.value }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            角色 *
                            <input
                              className={getInputClassName(shouldHighlightExperienceRequired && !item.role.trim(), "dark")}
                              value={item.role}
                              onChange={(event) =>
                                updateArrayItem<ProjectFormItem>("projects", index, (draft) => ({ ...draft, role: event.target.value }))
                              }
                            />
                          </label>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">起止时间 *</p>
                            <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
                            <label className="flex flex-col gap-2 text-sm text-slate-700">
                              开始时间 *
                              <input
                                type="month"
                                className={getInputClassName(shouldHighlightExperienceRequired && !item.startDate.trim(), "dark")}
                                value={item.startDate}
                                onChange={(event) =>
                                  updateArrayItem<ProjectFormItem>("projects", index, (draft) => ({ ...draft, startDate: event.target.value }))
                                }
                              />
                            </label>
                            <div className="pt-8 text-center text-lg text-slate-400">-</div>
                            <label className="flex flex-col gap-2 text-sm text-slate-700">
                              结束时间 *
                              <input
                                type="month"
                                className={getInputClassName(shouldHighlightExperienceRequired && !item.endDate.trim(), "dark")}
                                value={item.endDate}
                                onChange={(event) =>
                                  updateArrayItem<ProjectFormItem>("projects", index, (draft) => ({ ...draft, endDate: event.target.value }))
                                }
                              />
                            </label>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">原始内容 bullet *</p>
                            <textarea
                              className={`min-h-32 w-full ${getInputClassName(
                                shouldHighlightExperienceRequired && splitTextAreaLines(item.bullets).length === 0,
                                "dark",
                              )}`}
                              placeholder="每行输入一条项目内容"
                              value={item.bullets}
                              onChange={(event) =>
                                updateArrayItem<ProjectFormItem>("projects", index, (draft) => ({ ...draft, bullets: event.target.value }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section
                    id="intake-otherExperiences"
                    className={`border-b py-10 ${
                      resumeValidationAttempted && !hasAtLeastOneExperience ? "border-rose-400/70" : "border-slate-200/80"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapse("otherExperiences")}
                      className="grid w-full gap-6 text-left lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8"
                    >
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1">
                          <p className="text-2xl font-semibold tracking-tight text-slate-900">其他经历</p>
                          <div className="h-1 w-10 rounded-full bg-blue-500" />
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        {!collapsedSections.otherExperiences ? (
                          <div className="pt-1 text-sm leading-6 text-slate-500">校园、创业、自媒体、科研、比赛都可以放在这里，后续 AI 会作为辅助信息使用。</div>
                        ) : (
                          <div />
                        )}
                        <span className="shrink-0 text-sm text-blue-700">{collapsedSections.otherExperiences ? "展开" : "收起"}</span>
                      </div>
                    </button>
                    {!collapsedSections.otherExperiences ? (
                      <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8">
                        <div />
                        <div className="space-y-8 lg:pl-2">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setResumeForm((prev) => ({
                                ...prev,
                                otherExperiences: [...prev.otherExperiences, createOtherExperienceItem()],
                              }))
                            }
                            className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                          >
                            + 添加
                          </button>
                        </div>
                    {resumeForm.otherExperiences.map((item, index) => (
                      <div key={`other-${index}`} className="space-y-6 rounded-[28px] bg-[#f8fbff]/70 px-6 py-6">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800">其他经历 {index + 1}</p>
                          {resumeForm.otherExperiences.length > 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setResumeForm((prev) => ({
                                  ...prev,
                                  otherExperiences: prev.otherExperiences.filter((_, itemIndex) => itemIndex !== index),
                                }))
                              }
                              aria-label="删除其他经历"
                              title="删除其他经历"
                              className="rounded-full p-1 text-rose-300 transition hover:bg-rose-50 hover:text-rose-400"
                            >
                              <TrashIcon />
                            </button>
                          ) : null}
                        </div>
                        <div className="grid gap-5">
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            经历类型 *
                            <select
                              className={getInputClassName(shouldHighlightExperienceRequired && !item.type.trim(), "dark")}
                              value={item.type}
                              onChange={(event) =>
                                updateArrayItem<OtherExperienceFormItem>("otherExperiences", index, (draft) => ({
                                  ...draft,
                                  type: event.target.value as OtherExperienceType,
                                }))
                              }
                            >
                              {OTHER_EXPERIENCE_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            经历名称 *
                            <input
                              className={getInputClassName(shouldHighlightExperienceRequired && !item.name.trim(), "dark")}
                              value={item.name}
                              onChange={(event) =>
                                updateArrayItem<OtherExperienceFormItem>("otherExperiences", index, (draft) => ({ ...draft, name: event.target.value }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-2 text-sm text-slate-700">
                            角色 *
                            <input
                              className={getInputClassName(shouldHighlightExperienceRequired && !item.role.trim(), "dark")}
                              value={item.role}
                              onChange={(event) =>
                                updateArrayItem<OtherExperienceFormItem>("otherExperiences", index, (draft) => ({ ...draft, role: event.target.value }))
                              }
                            />
                          </label>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">起止时间 *</p>
                            <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)]">
                            <label className="flex flex-col gap-2 text-sm text-slate-700">
                              开始时间 *
                              <input
                                type="month"
                                className={getInputClassName(shouldHighlightExperienceRequired && !item.startDate.trim(), "dark")}
                                value={item.startDate}
                                onChange={(event) =>
                                  updateArrayItem<OtherExperienceFormItem>("otherExperiences", index, (draft) => ({ ...draft, startDate: event.target.value }))
                                }
                              />
                            </label>
                            <div className="pt-8 text-center text-lg text-slate-400">-</div>
                            <label className="flex flex-col gap-2 text-sm text-slate-700">
                              结束时间 *
                              <input
                                type="month"
                                className={getInputClassName(shouldHighlightExperienceRequired && !item.endDate.trim(), "dark")}
                                value={item.endDate}
                                onChange={(event) =>
                                  updateArrayItem<OtherExperienceFormItem>("otherExperiences", index, (draft) => ({ ...draft, endDate: event.target.value }))
                                }
                              />
                            </label>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-slate-700">原始内容 bullet *</p>
                            <textarea
                              className={`min-h-32 w-full ${getInputClassName(
                                shouldHighlightExperienceRequired && splitTextAreaLines(item.bullets).length === 0,
                                "dark",
                              )}`}
                              placeholder="每行输入一条经历内容"
                              value={item.bullets}
                              onChange={(event) =>
                                updateArrayItem<OtherExperienceFormItem>("otherExperiences", index, (draft) => ({ ...draft, bullets: event.target.value }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section id="intake-skills" className="border-b border-slate-200/80 py-10">
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapse("skills")}
                      className="grid w-full gap-6 text-left lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8"
                    >
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1">
                          <p className="text-2xl font-semibold tracking-tight text-slate-900">技能工具</p>
                          <div className="h-1 w-10 rounded-full bg-blue-500" />
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        {!collapsedSections.skills ? (
                          <div className="pt-1 text-sm leading-6 text-slate-500">每一类都支持识别预填、预设标签多选，以及手动补充自定义技能。</div>
                        ) : (
                          <div />
                        )}
                        <span className="shrink-0 text-sm text-blue-700">{collapsedSections.skills ? "展开" : "收起"}</span>
                      </div>
                    </button>
                    {!collapsedSections.skills ? (
                      <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8">
                        <div />
                        <div className="space-y-5 lg:pl-2">
                        {(Object.keys(SKILL_CATEGORY_LABELS) as SkillCategoryKey[]).map((category) => (
                          <div key={category} className="rounded-[24px] bg-[#f8fbff]/70">
                            <div className="flex w-full items-center justify-between gap-4 px-4 py-4">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <p className="shrink-0 text-sm font-medium text-slate-700">{SKILL_CATEGORY_LABELS[category]}</p>
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <input
                                    className="min-w-0 flex-1 rounded-full border border-slate-300 bg-white/95 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="手动添加"
                                    value={skillDraftInputs[category]}
                                    onChange={(event) => updateSkillDraftInput(category, event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        addCustomSkill(category);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => addCustomSkill(category)}
                                    className="rounded-full border border-blue-500/40 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:border-blue-600 hover:text-blue-900"
                                  >
                                    添加
                                  </button>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleSkillCategoryCollapse(category)}
                                className="shrink-0 text-xs font-medium text-blue-700 transition hover:text-blue-900"
                              >
                                {collapsedSkillCategories[category] ? "展开" : "收起"}
                              </button>
                            </div>
                            {!collapsedSkillCategories[category] ? (
                              <div className="space-y-3 px-4 pb-4">
                                <div className="flex flex-wrap gap-2">
                                  {resumeForm.skills[category].map((value) => (
                                    <button
                                      key={`selected-${category}-${value}`}
                                      type="button"
                                      onClick={() => toggleSkill(category, value)}
                                      className="rounded-full border border-blue-500/70 bg-blue-500/10 px-3 py-2 text-xs text-blue-900 transition hover:border-rose-400 hover:text-rose-200"
                                    >
                                      {value} ×
                                    </button>
                                  ))}
                                  {resumeForm.skills[category].length === 0 ? (
                                    <span className="text-xs text-slate-500">暂未添加</span>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                {SKILL_OPTIONS[category].map((option) => {
                                  const active = resumeForm.skills[category].includes(option);

                                  return (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => toggleSkill(category, option)}
                                      className={`rounded-full border px-3 py-2 text-xs transition ${
                                        active
                                          ? "border-blue-500/60 bg-blue-500/10 text-blue-800"
                                          : "border-slate-300 bg-[#f8fbff]/94 text-slate-700 hover:border-blue-500/40 hover:text-blue-800"
                                      }`}
                                    >
                                      {option}
                                    </button>
                                  );
                                })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section id="intake-selfSummary" className="border-b border-slate-200/80 py-10">
                    <button
                      type="button"
                      onClick={() => toggleSectionCollapse("selfSummary")}
                      className="grid w-full gap-6 text-left lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8"
                    >
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1">
                          <p className="text-2xl font-semibold tracking-tight text-slate-900">自我评价 / 优势</p>
                          <div className="h-1 w-10 rounded-full bg-blue-500" />
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        {!collapsedSections.selfSummary ? (
                          <div className="pt-1 text-sm leading-6 text-slate-500">这一块是辅助信息，先不强制填写，后续 AI 会酌情参考。</div>
                        ) : (
                          <div />
                        )}
                        <span className="shrink-0 text-sm text-blue-700">{collapsedSections.selfSummary ? "展开" : "收起"}</span>
                      </div>
                    </button>
                    {!collapsedSections.selfSummary ? (
                      <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(220px,0.4fr)_minmax(0,0.6fr)] lg:gap-8">
                        <div />
                        <div>
                        <textarea
                          className="min-h-36 w-full rounded-2xl border border-slate-300 bg-[#f7faff]/96 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          value={resumeForm.selfSummary}
                          onChange={(event) =>
                            setResumeForm((prev) => ({
                              ...prev,
                              selfSummary: event.target.value,
                            }))
                          }
                        />
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <div className="flex flex-wrap items-center gap-3 pt-10">
                    <button
                      className="inline-flex items-center justify-center rounded-full bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-600"
                      onClick={handleResumeNext}
                      disabled={!canProceedFromStepOne}
                    >
                      {importingResumePdf || importingJdImage
                        ? "正在解析..."
                        : parsingResume || generating
                          ? "生成中..."
                          : "下一步"}
                    </button>
                  </div>
              </div>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="space-y-5">
              <section className="rounded-3xl border border-slate-200 bg-white/92 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                <div className="mb-4 space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">投递信息</h2>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-800">投递岗位名称</span>
                    <input
                      type="text"
                      value={workflowTargetRole}
                      onChange={(event) => setWorkflowTargetRole(event.target.value)}
                      placeholder="必填，例如：海外GTM"
                      className="w-full rounded-2xl border border-slate-200 bg-[#f8fbff]/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-800">可实习时长</span>
                    <select
                      value={workflowInternshipDuration}
                      onChange={(event) =>
                        setWorkflowInternshipDuration(
                          event.target.value as (typeof WORKFLOW_INTERNSHIP_DURATION_OPTIONS)[number],
                        )
                      }
                      className={`w-full rounded-2xl border border-slate-200 bg-[#f8fbff]/90 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 ${
                        workflowInternshipDuration ? "text-slate-900" : "text-slate-400"
                      }`}
                    >
                      <option value="" disabled hidden>
                        必填，请选择
                      </option>
                      {WORKFLOW_INTERNSHIP_DURATION_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-800">投递公司名称</span>
                    <input
                      type="text"
                      value={workflowCompanyName}
                      onChange={(event) => setWorkflowCompanyName(event.target.value)}
                      placeholder="必填，例如：字节跳动"
                      className="w-full rounded-2xl border border-slate-200 bg-[#f8fbff]/90 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                    />
                  </label>
                </div>

                {!isWorkflowFormComplete ? (
                  <p className="mt-3 text-sm text-rose-600">请先完整填写以上 3 项必填信息，再选择模板。</p>
                ) : null}
              </section>

              <section className="grid gap-5 lg:grid-cols-2">
                <article className="rounded-3xl border border-blue-200 bg-white/92 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold text-slate-900">邮件求职信</h2>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {COVER_LETTER_TEMPLATE_PLACEHOLDERS.map((template) => {
                      const isSelected = isWorkflowFormComplete && selectedCoverLetterTemplateId === template.id;

                      return (
                        <AuroraGlowCard
                          key={template.id}
                          tone="strong"
                          disabled={!isWorkflowFormComplete}
                          className="h-full rounded-2xl"
                        >
                          <article
                            className={`h-full rounded-2xl border p-4 text-left transition ${
                              isSelected
                                ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]"
                                : isWorkflowFormComplete
                                  ? "border-slate-200 bg-[#f8fbff]/90 hover:border-blue-300/60 hover:bg-white"
                                  : "border-slate-200 bg-slate-50/90 opacity-60"
                            }`}
                          >
                            <p className="text-sm font-semibold text-slate-900">{template.title}</p>
                            <p className="mt-1 text-xs font-medium text-blue-700">{template.subtitle}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{template.description}</p>
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewTemplateId(template.id)}
                                disabled={!isWorkflowFormComplete}
                                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                              >
                                查看模板
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedCoverLetterTemplateId(template.id)}
                                disabled={!isWorkflowFormComplete}
                                className="inline-flex items-center justify-center rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-600"
                              >
                                {isSelected ? "已选择" : "选择此模板"}
                              </button>
                            </div>
                          </article>
                        </AuroraGlowCard>
                    )})}
                  </div>
                </article>

                <article className="rounded-3xl border border-blue-200 bg-white/92 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold text-slate-900">Boss 直聘打招呼语</h2>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {GREETING_TEMPLATE_PLACEHOLDERS.map((template) => {
                      const isSelected = isWorkflowFormComplete && selectedGreetingTemplateId === template.id;

                      return (
                        <AuroraGlowCard
                          key={template.id}
                          tone="strong"
                          disabled={!isWorkflowFormComplete}
                          className="h-full rounded-2xl"
                        >
                          <article
                            className={`h-full rounded-2xl border p-4 text-left transition ${
                              isSelected
                                ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]"
                                : isWorkflowFormComplete
                                  ? "border-slate-200 bg-[#f8fbff]/90 hover:border-blue-300/60 hover:bg-white"
                                  : "border-slate-200 bg-slate-50/90 opacity-60"
                            }`}
                          >
                            <p className="text-sm font-semibold text-slate-900">{template.title}</p>
                            <p className="mt-1 text-xs font-medium text-blue-700">{template.subtitle}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{template.description}</p>
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewTemplateId(template.id)}
                                disabled={!isWorkflowFormComplete}
                                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                              >
                                查看模板
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedGreetingTemplateId(template.id)}
                                disabled={!isWorkflowFormComplete}
                                className="inline-flex items-center justify-center rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-600"
                              >
                                {isSelected ? "已选择" : "选择此模板"}
                              </button>
                            </div>
                          </article>
                        </AuroraGlowCard>
                    )})}
                  </div>
                </article>
              </section>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="inline-flex items-center justify-center rounded-full bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-600"
                  onClick={handleTextResumeNext}
                  disabled={!isWorkflowFormComplete || hiddenGenerationStatus === "error"}
                >
                  {waitingStepNextRequested && hiddenGenerationStatus !== "success" ? "处理中..." : "下一步"}
                </button>
              </div>

              {previewTemplate && typeof document !== "undefined"
                ? createPortal(
                    <div
                      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/28 px-4 py-8 backdrop-blur-sm"
                      onClick={() => setPreviewTemplateId(null)}
                    >
                      <div
                        className="flex max-h-[82vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_70px_rgba(15,23,42,0.24)]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                              {previewTemplate.category === "boss-greeting" ? "Boss直聘打招呼语" : "邮件求职信"}
                            </p>
                            <h3 className="text-xl font-semibold text-slate-900">{previewTemplate.title}</h3>
                            <p className="text-sm leading-6 text-slate-600">{previewTemplate.subtitle}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPreviewTemplateId(null)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
                            aria-label="关闭模板预览"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-5">
                          <div className="space-y-5">
                            <div className="rounded-2xl border border-slate-200 bg-[#f8fbff] p-4">
                              <p className="text-sm leading-7 text-slate-700">{previewTemplate.description}</p>
                            </div>

                            <div className="grid gap-5 lg:grid-cols-2">
                              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-sm font-semibold text-slate-900">模板</p>
                                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                                  {previewTemplate.userFacing.template}
                                </pre>
                              </section>

                              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-sm font-semibold text-slate-900">示例参考</p>
                                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                                  {previewTemplate.userFacing.example}
                                </pre>
                              </section>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-slate-200 bg-white px-6 py-4">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (previewTemplate.category === "boss-greeting") {
                                  setSelectedGreetingTemplateId(previewTemplate.id);
                                } else {
                                  setSelectedCoverLetterTemplateId(previewTemplate.id);
                                }
                                setPreviewTemplateId(null);
                              }}
                              className="inline-flex items-center justify-center rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600"
                            >
                              选择此模板
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className="space-y-5">
              <section className="rounded-3xl border border-slate-200 bg-white/92 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-slate-900">岗位匹配表单</h2>
                  <p className="text-sm leading-6 text-slate-600">
                    这些问题来自AI基于你的「简历」与「目标岗位JD」分析出来的差距。你需要决定每条差距补到哪段经历里；提交后系统会自动完成对应经历的优化，再进入下一页AI精修。
                  </p>
                </div>
              </section>

              {globalGapAnalysisData?.gaps.length ? (
                <section className="grid gap-4 xl:grid-cols-2">
                  {globalGapAnalysisData.gaps.map((gapItem, gapIndex) => {
                    const assignment =
                      branchGapFormState.assignments[gapItem.gapId] ??
                      createEmptyBranchGapAssignmentItemState();
                    const selectedAssignableUnit = gapAssignableUnits.find(
                      (option) => option.unit.id === assignment.selectedUnitId,
                    );
                    const selectedAssignmentLabel =
                      assignment.selectedSection === "none"
                        ? "不在任何经历里补"
                        : selectedAssignableUnit?.title ?? "";

                    return (
                      <AuroraGlowCard
                        key={`global-gap-${gapItem.gapId}`}
                        tone="soft"
                        disabled={branchGapFormState.submitting}
                        className="h-full rounded-3xl"
                      >
                        <article
                          ref={(node) => {
                            branchGapCardRefs.current[gapItem.gapId] = node;
                          }}
                          className="h-full rounded-3xl border border-blue-200 bg-white/92 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]"
                        >
                          <div className="space-y-3">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-800">
                                差距 {gapIndex + 1}
                              </span>
                              <p className="text-base font-semibold text-slate-900">{gapItem.gapTitle}</p>
                            </div>
                            <p className="text-lg font-semibold leading-8 text-slate-900">{gapItem.mainQuestion}</p>
                            <p className="text-sm leading-6 text-slate-600">
                              为什么会有这个问题：{gapItem.whyThisGap}
                            </p>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-medium leading-5 text-slate-500">
                              请选择要补充到哪段经历，选中后再次点击可取消。
                            </p>
                            <div
                              className="relative"
                              ref={(node) => {
                                branchGapSelectorRefs.current[gapItem.gapId] = node;
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleBranchGapAssignmentSelector(gapItem.gapId)}
                                disabled={branchGapFormState.submitting}
                                className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-sm transition ${
                                  assignment.selectorOpen
                                    ? "border-blue-500 bg-blue-500/[0.06] text-slate-900"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-slate-900"
                                }`}
                              >
                                <span className={selectedAssignmentLabel ? "text-slate-900" : "text-slate-400"}>
                                  {selectedAssignmentLabel || "请选择要补充到哪段经历"}
                                </span>
                                <ChevronDownIcon open={assignment.selectorOpen} />
                              </button>

                              {assignment.selectorOpen ? (
                                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-10 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                                  <div className="space-y-1">
                                    {gapAssignableUnits.map((option) => {
                                      const isSelected = assignment.selectedUnitId === option.unit.id;
                                      return (
                                        <button
                                          key={`${gapItem.gapId}-${option.unit.id}`}
                                          type="button"
                                          onClick={() =>
                                            handleBranchGapAssignmentSelect(
                                              gapItem.gapId,
                                              option.unit.sectionKey,
                                              option.unit.id,
                                            )
                                          }
                                          disabled={branchGapFormState.submitting}
                                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                                            isSelected
                                              ? "bg-blue-500/10 font-medium text-blue-900"
                                              : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                          }`}
                                        >
                                          <span>{option.title}</span>
                                          {isSelected ? (
                                            <span className="text-xs font-medium text-blue-700">再次点击可取消</span>
                                          ) : null}
                                        </button>
                                      );
                                    })}
                                    <button
                                      type="button"
                                      onClick={() => handleBranchGapAssignmentSelect(gapItem.gapId, "none", "")}
                                      disabled={branchGapFormState.submitting}
                                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                                        assignment.selectedSection === "none"
                                          ? "bg-blue-500/10 font-medium text-blue-900"
                                          : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                      }`}
                                    >
                                      <span>不在任何经历里补</span>
                                      {assignment.selectedSection === "none" ? (
                                        <span className="text-xs font-medium text-blue-700">再次点击可取消</span>
                                      ) : null}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-start justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggleBranchGapGuide(gapItem.gapId)}
                              className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-900"
                            >
                              回答指南
                            </button>
                          </div>

                          {assignment.guideOpen ? (
                            <div className="rounded-2xl border border-blue-500/18 bg-blue-500/5 p-3">
                              <p className="text-xs font-semibold tracking-[0.12em] text-blue-800">回答点拨</p>
                              <div className="mt-2 space-y-1.5">
                                {gapItem.howToAnswer.map((hint, hintIndex) => (
                                  <p key={`${gapItem.gapId}-hint-${hintIndex}`} className="text-xs leading-5 text-slate-700">
                                    {hint}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <textarea
                            rows={4}
                            value={assignment.userAnswer}
                            onChange={(event) => handleBranchGapFormAnswerChange(gapItem.gapId, event.target.value)}
                            disabled={branchGapFormState.submitting}
                            placeholder="在这里补充这条差距对应的信息；如果暂时不想处理，也可以不填。"
                            className="w-full resize-y rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-slate-50"
                          />

                          {assignment.error ? (
                            <p className="text-xs font-medium text-rose-600">{assignment.error}</p>
                          ) : null}
                          </div>
                        </article>
                      </AuroraGlowCard>
                    );
                  })}
                </section>
              ) : (
                <section className="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-8 text-center text-sm leading-6 text-slate-500">
                  当前没有需要额外补充的全局差距，可以直接进入下一页继续精修简历。
                </section>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSubmitGlobalGapForm}
                  disabled={branchGapFormState.submitting}
                  className="inline-flex items-center justify-center rounded-full bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white/80"
                >
                  {branchGapFormState.submitting ? "处理中..." : "进入AI简历精修"}
                </button>
              </div>
            </div>
          ) : null}

          {currentStep === 6 ? (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
              <section className="relative flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#fffefd]/88">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-slate-900">AI精修区</h2>
                    <p className="text-sm text-slate-600">
                      按顺序查看每一段经历。需要打磨时点击「修改」进入独立AI精修区，满意后再「采用」到右侧预览区。
                    </p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {draftJsonState ? (
                    <div className="space-y-4">
                      {overviewUnitsBySection.basic_info.map((unit) => renderOverviewCard(unit))}
                      {overviewUnitsBySection.education.map((unit) => renderOverviewCard(unit))}

                      {([
                        { key: "internships", title: "实习经历" },
                        { key: "projects", title: "项目经历" },
                        { key: "other_experiences", title: "其他经历" },
                      ] as const).map(({ key, title }) => {
                        const units = overviewUnitsBySection[key];
                        if (units.length === 0) {
                          return null;
                        }

                        return (
                          <section
                            key={`overview-group-${key}`}
                            className="rounded-[28px] border border-slate-200 bg-[#f7faff]/94 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                          >
                            <div className="mb-2 px-1">
                              <h3 className="text-sm font-semibold tracking-wide text-slate-700">{title}</h3>
                            </div>
                            <div className="space-y-3">
                              {units.map((unit) => renderOverviewCard(unit, { draggable: true }))}
                            </div>
                          </section>
                        );
                      })}

                      {overviewUnitsBySection.skills.map((unit) => renderOverviewCard(unit))}
                      {overviewUnitsBySection.personal_advantages.map((unit) => renderOverviewCard(unit))}
                    </div>
                  ) : null}
                </div>

                {branchUnitId && draftJsonState ? (
                  <div className="absolute inset-0 z-20 flex items-stretch justify-center rounded-3xl bg-[#f7faff]/92 p-1.5 backdrop-blur-sm">
                    <section className="flex w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#f7faff]/95 shadow-2xl backdrop-blur-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                        <button
                          type="button"
                          onClick={handleCloseBranch}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-500 hover:text-slate-950"
                        >
                          <BackIcon />
                          返回
                        </button>
                        <p className="text-sm font-medium text-slate-700">
                          {branchUnit ? buildBranchTitle(branchUnit, draftJsonState) : "分支修改"}
                        </p>
                      </div>

                      <div ref={branchScrollContainerRef} className="flex-1 overflow-y-auto p-4">
                        <div className="space-y-3">
                          {branchUnit &&
                          isOptimizableSection(branchUnit.sectionKey) &&
                          activeBranchPlanningState?.visible ? (
                            <section className="rounded-[28px] border border-blue-500/20 bg-white/92 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                              <div className="flex items-start gap-3">
                                <div className="flex flex-col items-center pt-0.5">
                                  <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-blue-400/70 bg-blue-500/8 text-blue-700">
                                    {branchInputLocked ? (
                                      <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-blue-500" />
                                    ) : (
                                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                                    )}
                                  </span>
                                  <span className="mt-2 h-full min-h-[70px] w-px bg-gradient-to-b from-blue-300/60 to-transparent" />
                                </div>

                                <div className="min-w-0 flex-1 space-y-3">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="space-y-1">
                                      <p className="text-base font-semibold leading-6 text-slate-900">
                                        {activeBranchPlanningState.title}
                                      </p>
                                      {activeBranchPlanningState.subtext ? (
                                        <p className="text-sm leading-6 text-slate-500">
                                          {activeBranchPlanningState.subtext}
                                        </p>
                                      ) : null}
                                    </div>
                                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-800">
                                      {branchInputLocked ? "进行中" : "已更新"}
                                    </span>
                                  </div>

                                  {activeBranchPlanningState.decision ? (
                                    <div className="rounded-2xl border border-slate-200 bg-[#f8fcfb] px-3.5 py-2.5">
                                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                        当前判断
                                      </p>
                                      <p className="mt-1 text-sm leading-6 text-slate-800">
                                        {activeBranchPlanningState.decision}
                                      </p>
                                    </div>
                                  ) : null}

                                  {activeBranchPlanningState.nextStep ? (
                                    <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5">
                                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                        下一步
                                      </p>
                                      <p className="mt-1 text-sm leading-6 text-slate-800">
                                        {activeBranchPlanningState.nextStep}
                                      </p>
                                    </div>
                                  ) : null}

                                  {activeBranchPlanningState.showPreview && activeBranchPlanningPreviewDraft ? (
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                                        当前采用版本
                                      </p>
                                      <div className="rounded-2xl border border-blue-500/20 bg-white/90 p-3 text-slate-800">
                                        {renderUnitPreview(branchUnit, activeBranchPlanningPreviewDraft)}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </section>
                          ) : null}

                          {branchMessageRounds.map((roundGroup, roundIndex) => {
                            const isCurrentRound = roundIndex === branchMessageRounds.length - 1;
                            const isExpanded = isCurrentRound
                              ? true
                              : branchExpandedRounds[branchUnitId ?? ""]?.[roundGroup.round] ?? false;

                            return (
                              <section key={`${branchUnitId}-round-${roundGroup.round}`} className="space-y-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    !isCurrentRound && branchUnitId
                                      ? handleToggleBranchRound(branchUnitId, roundGroup.round)
                                      : undefined
                                  }
                                  className={`flex w-full items-center gap-3 rounded-2xl px-1.5 py-1.5 text-left ${
                                    isCurrentRound ? "cursor-default" : "transition hover:bg-[#f8fbff]/92"
                                  }`}
                                >
                                  <div className="h-px flex-1 bg-slate-800" />
                                  <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-slate-600">
                                    <span>{buildBranchRoundDividerText(roundGroup.round)}</span>
                                    {isCurrentRound ? (
                                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-800">
                                        当前
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">{isExpanded ? "收起" : "展开"}</span>
                                    )}
                                  </div>
                                  <div className="h-px flex-1 bg-slate-800" />
                                </button>

                                {isExpanded ? (
                                  <div className="space-y-4">
                                    {roundGroup.messages.map((message, messageIndex) => {
                                      const branchUnit = confirmationQueue.find((unit) => unit.id === message.unitId);
                                      const isUserMessage = message.role === "user";
                                      const shouldShowInitialPreviewBlock =
                                        branchUnit !== undefined &&
                                        isOptimizableSection(branchUnit.sectionKey) &&
                                        roundGroup.round === 1 &&
                                        messageIndex === 0 &&
                                        message.role === "ai" &&
                                        message.type === "modify-placeholder";
                                      const previewDraftJson =
                                        branchUnit && message.versionItem
                                          ? applyOptimizedItemToDraftJson(draftJsonState, branchUnit, message.versionItem)
                                          : branchUnit && message.type === "optimize-result" && pendingOptimizations[message.unitId]
                                            ? applyOptimizedItemToDraftJson(draftJsonState, branchUnit, pendingOptimizations[message.unitId])
                                            : draftJsonState;
                                      const shouldShowActionButtons =
                                        (message.type === "optimize-result" ||
                                          (message.type === "section" && message.versionItem)) &&
                                        branchUnit &&
                                        message.versionItem &&
                                        !shouldShowInitialPreviewBlock;

                                      return (
                                        <div key={message.id} className="space-y-3.5">
                                          <div className={`flex ${isUserMessage ? "justify-end" : "justify-start"}`}>
                                            <div
                                              className={`w-fit max-w-[82%] rounded-[26px] px-3 py-2 text-[13px] leading-6 shadow-[0_6px_18px_rgba(15,23,42,0.04)] ${
                                                isUserMessage
                                                  ? "rounded-br-md bg-[#eaf3ff] text-slate-900"
                                                  : "rounded-bl-md bg-blue-500/10 text-slate-900"
                                              }`}
                                            >
                                              <p className={isUserMessage ? "text-right" : ""}>{message.text}</p>
                                            {shouldShowInitialPreviewBlock && branchUnit && previewDraftJson ? (
                                              <div className="mt-3.5 space-y-2">
                                                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                                                  当前采用版本
                                                </p>
                                                <div className="rounded-2xl border border-blue-500/20 bg-white/80 p-3 text-slate-800">
                                                  {renderUnitPreview(branchUnit, previewDraftJson)}
                                                </div>
                                              </div>
                                            ) : null}
                                            {(message.type === "optimize-result" || message.type === "section") &&
                                            branchUnit &&
                                            previewDraftJson ? (
                                              <div className="mt-2.5 rounded-2xl border border-blue-500/20 bg-white/80 p-3 text-slate-800">
                                                {renderUnitPreview(branchUnit, previewDraftJson)}
                                              </div>
                                            ) : null}
                                            </div>
                                          </div>

                                          {shouldShowActionButtons ? (
                                            <div className="space-y-2.5 pl-1">
                                              {isQuickActionSection(branchUnit.sectionKey) && branchQuickActions.length > 0 ? (
                                                branchUnit.sectionKey === "education" ? (
                                                  <div className="space-y-2.5">
                                                    <div className="space-y-2">
                                                      <p className="text-xs font-medium text-slate-500">全部教育经历</p>
                                                      <div className="flex flex-wrap gap-1.5">
                                                        {branchQuickActions.slice(0, 5).map((action) => (
                                                          <button
                                                            key={`${message.id}-${action.label}`}
                                                            type="button"
                                                            onClick={() => handleSelectBranchQuickAction(action)}
                                                            disabled={branchOptimizing}
                                                            className={`rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
                                                              branchActiveQuickActionLabel === action.label
                                                                ? "border-blue-500 bg-blue-500/15 text-blue-900"
                                                                : "border-slate-300 bg-[#f8fbff]/94 text-slate-700 hover:border-blue-500/50 hover:text-blue-900"
                                                            } disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-500`}
                                                          >
                                                            {branchOptimizing && branchActiveQuickActionLabel === action.label
                                                              ? "处理中..."
                                                              : action.label}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                      <p className="text-xs font-medium text-slate-500">某段教育经历</p>
                                                      <div className="flex flex-wrap gap-1.5">
                                                        {branchQuickActions.slice(5).map((action) => (
                                                          <button
                                                            key={`${message.id}-${action.label}`}
                                                            type="button"
                                                            onClick={() => handleSelectBranchQuickAction(action)}
                                                            disabled={branchOptimizing}
                                                            className={`rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
                                                              branchActiveQuickActionLabel === action.label
                                                                ? "border-blue-500 bg-blue-500/15 text-blue-900"
                                                                : "border-slate-300 bg-[#f8fbff]/94 text-slate-700 hover:border-blue-500/50 hover:text-blue-900"
                                                            } disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-500`}
                                                          >
                                                            {branchOptimizing && branchActiveQuickActionLabel === action.label
                                                              ? "处理中..."
                                                              : action.label}
                                                          </button>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div className="flex flex-wrap gap-1.5">
                                                    {branchQuickActions.map((action) => (
                                                      <button
                                                        key={`${message.id}-${action.label}`}
                                                        type="button"
                                                        onClick={() => handleSelectBranchQuickAction(action)}
                                                        disabled={branchOptimizing}
                                                        className={`rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
                                                          branchActiveQuickActionLabel === action.label
                                                            ? "border-blue-500 bg-blue-500/15 text-blue-900"
                                                            : "border-slate-300 bg-[#f8fbff]/94 text-slate-700 hover:border-blue-500/50 hover:text-blue-900"
                                                        } disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-500`}
                                                      >
                                                        {branchOptimizing && branchActiveQuickActionLabel === action.label
                                                          ? "处理中..."
                                                          : action.label}
                                                      </button>
                                                    ))}
                                                  </div>
                                                )
                                              ) : null}
                                              <div className="flex flex-wrap gap-2">
                                                <button
                                                  type="button"
                                                  className="inline-flex items-center justify-center rounded-full border border-blue-500/35 bg-white px-3.5 py-1.5 text-sm font-semibold text-blue-700 transition hover:border-blue-600 hover:text-blue-900 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500"
                                                  onClick={() => handleContinueBranchWithVersion(branchUnit, message.versionItem!)}
                                                  disabled={isBusy}
                                                >
                                                  <span className="mr-2"><EditPencilIcon /></span>
                                                  继续修改
                                                </button>
                                              <button
                                                type="button"
                                                className="inline-flex items-center justify-center rounded-full bg-blue-500 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-600"
                                                onClick={() =>
                                                  handleAcceptOptimizedResult(branchUnit, message.versionItem!)
                                                }
                                                disabled={isBusy}
                                              >
                                                  采用
                                                </button>
                                              </div>
                                            </div>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </section>
                            );
                          })}

                        </div>
                      </div>

                      <div className="border-t border-slate-200 bg-[#fffefd]/95 p-3">
                        <div className="flex gap-3">
                          <textarea
                            ref={branchInputRef}
                            rows={1}
                            className="flex-1 resize-none overflow-y-auto rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-[#eef4ff]/80 disabled:text-slate-500"
                            placeholder={branchInputPlaceholder}
                            value={branchInput}
                            onChange={(event) => {
                              setBranchInput(event.target.value);
                              if (branchActiveQuickActionLabel && event.target.value.trim() === "") {
                                setBranchActiveQuickActionLabel(null);
                              }
                            }}
                            onKeyDown={handleBranchInputKeyDown}
                            disabled={branchInputLocked}
                          />
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-2xl bg-blue-500 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-600"
                            onClick={handleBranchSendChat}
                            disabled={
                              branchInputLocked || !branchInput.trim() || branchHasRequiredPlaceholder
                            }
                          >
                            发送
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                ) : null}
              </section>

              <section className="relative flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[#fffefd] shadow-[0_20px_60px_rgba(15,23,42,0.15)]">
                {draftJsonState && confirmationQueue.some((unit) => acceptedUnits[unit.id]) ? (
                  <>
                    <div className="z-20 border-b border-slate-200 bg-[#f7faff]/95 px-4 py-3 backdrop-blur-sm">
                      <div className="mx-auto flex max-w-[210mm] items-start justify-between gap-3">
                        <div
                          ref={previewToolbarRef}
                          className={`relative ${isPreviewToolbarExpanded ? "w-full rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur" : "w-fit"}`}
                        >
                          {!isPreviewToolbarExpanded ? (
                            <button
                              type="button"
                              onClick={() => setIsPreviewToolbarExpanded(true)}
                              className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-[#eef4ff] px-3 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-[#e8f1ff] hover:text-slate-700"
                            >
                              <PreviewToolbarIcon kind="trigger" />
                              <span>排版工具栏</span>
                            </button>
                          ) : (
                            <div className="flex w-full flex-col gap-2">
                              <div className="grid min-w-0 grid-cols-4 gap-3">
                                {(
                                  [
                                    { key: "fontSize", label: "字号", icon: "fontSize", options: PREVIEW_TOOLBAR_OPTIONS.fontSize },
                                    { key: "fontFamily", label: "字体", icon: "fontFamily", options: PREVIEW_TOOLBAR_OPTIONS.fontFamily },
                                    { key: "fontWeight", label: "粗细", icon: "fontWeight", options: PREVIEW_TOOLBAR_OPTIONS.fontWeight },
                                    { key: "margin", label: "左右边距", icon: "margin", options: PREVIEW_TOOLBAR_OPTIONS.margin },
                                  ] as const
                                ).map((group) => (
                                  <div
                                    key={group.key}
                                    className="flex min-w-0 items-center justify-start gap-1 px-0.5 py-0.5"
                                  >
                                    <div className="flex min-w-0 shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] font-semibold text-slate-700">
                                      <span className="truncate">{group.label}</span>
                                    </div>
                                    <div className="flex h-[26px] shrink-0 overflow-hidden rounded-full border border-slate-200 bg-[#f8fcfb] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                                      {group.options.slice(0, 2).map((option) => {
                                        const selected = previewSettings[group.key] === option.value;
                                        return (
                                          <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => handlePreviewChoiceChange(group.key, option.value)}
                                            className={`min-w-[32px] rounded-full px-2.5 text-[10px] font-semibold transition ${
                                              selected
                                                ? "bg-blue-500 text-white shadow-[0_6px_14px_rgba(59,130,246,0.22)]"
                                                : "text-slate-600 hover:text-slate-800"
                                            }`}
                                          >
                                            {getPreviewToolbarShortLabel(group.key, option.value)}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="grid min-w-0 grid-cols-3 gap-3">
                                {(Object.keys(PREVIEW_SLIDER_OPTIONS) as PreviewSliderKey[]).map((sliderKey) => (
                                  <div key={sliderKey} className="relative flex min-w-0 flex-col gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActivePreviewSlider((current) => (current === sliderKey ? null : sliderKey))
                                      }
                                      className={`flex min-w-0 items-center justify-between gap-2 rounded-2xl border px-3 py-0.5 text-left transition ${
                                        activePreviewSlider === sliderKey
                                          ? "border-blue-500 bg-blue-50/80 shadow-[0_10px_24px_rgba(59,130,246,0.14)]"
                                          : "border-slate-200 bg-white hover:border-blue-300"
                                      }`}
                                    >
                                      <span className="truncate whitespace-nowrap text-[10px] font-semibold text-slate-700">
                                        {PREVIEW_SLIDER_OPTIONS[sliderKey].label}
                                      </span>
                                      <span className="shrink-0 text-slate-500">
                                        <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]" aria-hidden="true">
                                          <path
                                            d="M4.5 6.5h11M4.5 10h11M4.5 13.5h11M8 5v3m4 1v3m-2 1v3"
                                            stroke="currentColor"
                                            strokeWidth="1.55"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        </svg>
                                      </span>
                                    </button>

                                    {activePreviewSlider === sliderKey ? (
                                      <div
                                        onMouseLeave={() => setActivePreviewSlider(null)}
                                        className="absolute left-0 top-full z-30 mt-2 w-full min-w-[220px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_16px_34px_rgba(15,23,42,0.12)]"
                                      >
                                        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-medium text-slate-700">
                                          <span className="truncate">{PREVIEW_SLIDER_OPTIONS[sliderKey].label}</span>
                                          <span className="shrink-0">
                                            {previewSettings[sliderKey]}
                                            {PREVIEW_SLIDER_OPTIONS[sliderKey].unit}
                                          </span>
                                        </div>
                                        <input
                                          type="range"
                                          min={PREVIEW_SLIDER_OPTIONS[sliderKey].min}
                                          max={PREVIEW_SLIDER_OPTIONS[sliderKey].max}
                                          step={PREVIEW_SLIDER_OPTIONS[sliderKey].step}
                                          value={previewSettings[sliderKey]}
                                          onChange={(event) =>
                                            setPreviewSettings((prev) => ({
                                              ...prev,
                                              [sliderKey]: Number(event.target.value),
                                            }))
                                          }
                                          className="w-full accent-blue-500"
                                        />
                                        <div className="mt-2 flex items-center justify-between text-[9px] text-slate-400">
                                          <span>{PREVIEW_SLIDER_OPTIONS[sliderKey].min}{PREVIEW_SLIDER_OPTIONS[sliderKey].unit}</span>
                                          <span>{PREVIEW_SLIDER_OPTIONS[sliderKey].max}{PREVIEW_SLIDER_OPTIONS[sliderKey].unit}</span>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenExportHub}
                          disabled={!hasAcceptedPreview}
                          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-[#eef4ff] px-3 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-[#e8f1ff] hover:text-slate-700"
                        >
                          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                            <path
                              d="M10 3.5v8m0 0 3-3m-3 3-3-3M5 13.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span>导出</span>
                        </button>
                      </div>
                    </div>

                    <div
                      ref={previewViewportRef}
                      className="relative flex-1 overflow-auto bg-[#f7faff]/95 p-4 backdrop-blur-sm"
                      onDoubleClick={resetPreviewZoom}
                      onWheel={handlePreviewWheel}
                      onTouchStart={handlePreviewTouchStart}
                      onTouchMove={handlePreviewTouchMove}
                      onTouchEnd={handlePreviewTouchEnd}
                      onTouchCancel={handlePreviewTouchEnd}
                      style={{ touchAction: "pan-x pan-y" }}
                    >
                    <div
                      className="relative mx-auto"
                      style={{
                        width: `${exportPreviewWidthPx * previewEffectiveScale}px`,
                        height: `${exportPreviewHeightPx * previewEffectiveScale}px`,
                      }}
                    >
                      <div
                        ref={previewPaperRef}
                        className="absolute left-0 top-0"
                        style={{
                          width: `${exportPreviewWidthPx}px`,
                          minHeight: `${exportPreviewHeightPx}px`,
                          height: `${exportPreviewHeightPx}px`,
                          transform: `scale(${previewEffectiveScale})`,
                          transformOrigin: "top left",
                        }}
                        >
                          <div
                            ref={previewMeasureRef}
                          aria-hidden="true"
                          className="pointer-events-none absolute left-[-99999px] top-0 opacity-0"
                          style={{
                            width: `${exportPreviewWidthPx}px`,
                          }}
                        >
                          <div
                            className="relative bg-white"
                            style={{
                              left: `${previewHorizontalMarginPx}px`,
                              right: `${previewHorizontalMarginPx}px`,
                              width: `${exportPreviewWidthPx - previewHorizontalMarginPx * 2}px`,
                            }}
                          >
                            {previewLayoutBlocks.map((block) => (
                              <div
                                key={`measure-${block.id}`}
                                data-layout-id={block.id}
                                data-layout-kind={block.kind}
                                data-layout-unit-id={block.unitId}
                                data-layout-section={block.sectionKey}
                                data-keep-together={block.keepTogether ? "true" : "false"}
                              >
                                {block.content}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div
                          ref={previewContentRef}
                          className="pointer-events-none absolute top-0 invisible z-0"
                          style={{
                            left: `${previewHorizontalMarginPx}px`,
                            right: `${previewHorizontalMarginPx}px`,
                          }}
                        >
                          {renderPreviewSections({ assignRefs: false, highlightActive: false })}
                        </div>
                        <div
                          key="preview-paper-single"
                          className="resume-preview-page absolute left-0 top-0 w-full overflow-hidden bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                          ref={(node) => {
                            previewPageRefs.current[0] = node;
                          }}
                          style={{
                            aspectRatio: "210 / 297",
                            minHeight: `${exportPreviewHeightPx}px`,
                            height: `${exportPreviewHeightPx}px`,
                          }}
                        >
                          <div
                            className="absolute overflow-hidden"
                            style={{
                              top: `${previewVerticalMarginPx}px`,
                              bottom: `${previewVerticalMarginPx}px`,
                              left: `${previewHorizontalMarginPx}px`,
                              right: `${previewHorizontalMarginPx}px`,
                              height: `${previewPaginatedBodyHeightPx}px`,
                            }}
                          >
                            {renderPreviewSections({ assignRefs: true, highlightActive: true })}
                          </div>
                        </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-[#f7faff]/95 px-6 text-center text-sm leading-6 text-slate-500 backdrop-blur-sm">
                    采用某个板块后，这里会实时展示简历预览。
                  </div>
                )}
              </section>

            </div>
          ) : null}

          {currentStep === 6 && isPreviewOverflowModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/28 px-4 py-8 backdrop-blur-sm"
              onClick={() => {
                setIsPreviewOverflowModalOpen(false);
                setPreviewOverflowDismissedSignature(previewSinglePageOverflow.signature);
              }}
            >
              <div
                className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_28px_70px_rgba(15,23,42,0.24)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">单页提醒</p>
                  <h3 className="text-2xl font-semibold text-slate-900">简历已超出第一页范围</h3>
                  <p className="text-sm leading-7 text-slate-600">
                    当前简历内容已经超出第一页范围，或有板块未完整显示。对于应届生 / 实习求职，最佳简历页数通常为一页，建议删减内容并压缩表述。
                  </p>
                </div>

                <div className="mt-5 space-y-3 rounded-3xl border border-rose-200 bg-rose-50/70 p-5">
                  <p className="text-sm font-semibold text-rose-900">当前检测到的问题</p>
                  <ul className="space-y-2 text-sm leading-6 text-rose-900">
                    {previewSinglePageOverflow.truncatedSections.length > 0 ? (
                      <li>有板块在第一页底部被截断：{previewSinglePageOverflow.truncatedSections.join("、")}</li>
                    ) : null}
                    {previewSinglePageOverflow.hiddenSections.length > 0 ? (
                      <li>有板块未完整进入第一页：{previewSinglePageOverflow.hiddenSections.join("、")}</li>
                    ) : null}
                    <li>当前内容超出第一页可用范围约 {Math.max(1, Math.round(previewSinglePageOverflow.totalOverflowPx))} px。</li>
                  </ul>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPreviewOverflowModalOpen(false);
                      setPreviewOverflowDismissedSignature(previewSinglePageOverflow.signature);
                      const viewportNode = previewViewportRef.current;
                      if (viewportNode) {
                        viewportNode.scrollTop = 0;
                        viewportNode.scrollLeft = 0;
                      }
                    }}
                    className="inline-flex items-center justify-center rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
                  >
                    返回删减
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === 7 ? (
            <div id="export-screen" className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(6)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-500 hover:text-slate-950"
                >
                  <BackIcon />
                  返回预览
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAllExports}
                  disabled={isExportingBundle}
                  className="inline-flex items-center justify-center rounded-full bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white/80"
                >
                  {isExportingBundle ? "打包中..." : "一键下载全部"}
                </button>
              </div>

              <section className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-slate-900">简历导出</h2>
                </div>
                <div className="grid items-stretch gap-4 lg:grid-cols-3">
                  <AuroraGlowCard tone="strong" disabled={isExportingPdf} className="h-full rounded-3xl">
                    <article className="flex h-full flex-col rounded-3xl border border-blue-200 bg-white/92 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700">
                          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                            <path d="M10 3.5v8m0 0 3-3m-3 3-3-3M5 13.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">PDF</h3>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        用于正式「网申」投递时展示最终定稿版本，让招聘方看到最完整、最稳定的简历排版。
                      </p>
                      <button
                        type="button"
                        onClick={handleExportPdf}
                        disabled={isExportingPdf}
                        className="mt-4 inline-flex items-center justify-center self-start rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600"
                      >
                        {isExportingPdf ? "导出中..." : "导出PDF"}
                      </button>
                    </article>
                  </AuroraGlowCard>

                  <AuroraGlowCard tone="strong" disabled={isExportingWord} className="h-full rounded-3xl">
                    <article className="flex h-full flex-col rounded-3xl border border-blue-200 bg-white/92 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700">
                          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                            <path d="M6 4.5h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Zm2 3h4m-4 3h4m-4 3h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">Word 文档</h3>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        适合继续手动修改内容，便于你针对不同岗位再做细调和版本调整。
                      </p>
                      <button
                        type="button"
                        onClick={handleExportWord}
                        disabled={isExportingWord}
                        className="mt-4 inline-flex items-center justify-center self-start rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white/80"
                      >
                        {isExportingWord ? "导出中..." : "导出Word"}
                      </button>
                    </article>
                  </AuroraGlowCard>

                  <AuroraGlowCard tone="strong" disabled={isExportingImages} className="h-full rounded-3xl">
                    <article className="flex h-full flex-col rounded-3xl border border-blue-200 bg-white/92 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700">
                          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                            <path d="M6 4.5h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Zm2 3h4m-4 3h4m-4 3h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">图片</h3>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-600">
                        用于「Boss直聘」平台即时发送，让 HR 第一时间看到你的简历整体效果。
                      </p>
                      <button
                        type="button"
                        onClick={handleExportImages}
                        disabled={isExportingImages}
                        className="mt-4 inline-flex items-center justify-center self-start rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600"
                      >
                        {isExportingImages ? "导出中..." : "导出图片"}
                      </button>
                    </article>
                  </AuroraGlowCard>
                </div>
              </section>

              <section className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-slate-900">附加投递材料</h2>
                </div>
                <div className="grid items-stretch gap-4 lg:grid-cols-2">
                  <AuroraGlowCard tone="strong" disabled={coverLetterAsset.status === "running"} className="h-full rounded-3xl">
                    <article className="flex h-full flex-col rounded-3xl border border-blue-200 bg-white/92 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700">
                          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                            <path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h8a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 14 13H9.5L6 15v-2H6A1.5 1.5 0 0 1 4.5 11.5v-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">邮件求职信</h3>
                      </div>
                      <div className="mt-4 min-h-0 text-sm leading-6">
                        {coverLetterAsset.status === "running" ? (
                          <p className="text-slate-500">正在后台生成邮件求职信...</p>
                        ) : coverLetterAsset.status === "error" ? (
                          <p className="text-rose-500">{coverLetterAsset.error || "邮件求职信生成失败"}</p>
                        ) : coverLetterAsset.content ? (
                          <p className="text-slate-500">
                            适合「邮件投递」时直接作为正文发送，帮助你更完整地表达岗位匹配度与求职动机。
                          </p>
                        ) : (
                          <p className="text-slate-500">当前还没有生成结果。</p>
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadCoverLetter}
                          disabled={coverLetterAsset.status !== "success"}
                          className="inline-flex items-center justify-center rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white/80"
                        >
                          下载 TXT
                        </button>
                        <button
                          type="button"
                          onClick={() => setGeneratedResultPreviewKind("cover-letter")}
                          disabled={coverLetterAsset.status !== "success"}
                          className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          查看
                        </button>
                      </div>
                    </article>
                  </AuroraGlowCard>

                  <AuroraGlowCard tone="strong" disabled={bossGreetingAsset.status === "running"} className="h-full rounded-3xl">
                    <article className="flex h-full flex-col rounded-3xl border border-blue-200 bg-white/92 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-700">
                          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                            <path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h8a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 14 13H9.5L6 15v-2H6A1.5 1.5 0 0 1 4.5 11.5v-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900">Boss直聘打招呼语</h3>
                      </div>
                      <div className="mt-4 min-h-0 text-sm leading-6">
                        {bossGreetingAsset.status === "running" ? (
                          <p className="text-slate-500">正在后台生成 Boss 打招呼语...</p>
                        ) : bossGreetingAsset.status === "error" ? (
                          <p className="text-rose-500">{bossGreetingAsset.error || "Boss 打招呼语生成失败"}</p>
                        ) : bossGreetingAsset.content ? (
                          <p className="text-slate-500">
                            适合在「Boss直聘」用于即时沟通开场，快速说明你的匹配点与到岗意愿。
                          </p>
                        ) : (
                          <p className="text-slate-500">当前还没有生成结果。</p>
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadBossGreeting}
                          disabled={bossGreetingAsset.status !== "success"}
                          className="inline-flex items-center justify-center rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white/80"
                        >
                          下载 TXT
                        </button>
                        <button
                          type="button"
                          onClick={() => setGeneratedResultPreviewKind("boss-greeting")}
                          disabled={bossGreetingAsset.status !== "success"}
                          className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          查看
                        </button>
                      </div>
                    </article>
                  </AuroraGlowCard>
                </div>
              </section>

              {generatedResultPreview && typeof document !== "undefined"
                ? createPortal(
                    <div
                      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/28 px-4 py-8 backdrop-blur-sm"
                      onClick={() => setGeneratedResultPreviewKind(null)}
                    >
                      <div
                        className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_70px_rgba(15,23,42,0.24)]"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-7 py-5">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">结果预览</p>
                            <h3 className="text-2xl font-semibold text-slate-900">{generatedResultPreview.title}</h3>
                            <p className="text-sm leading-6 text-slate-600">当前模板：{generatedResultPreview.templateTitle}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setGeneratedResultPreviewKind(null)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
                            aria-label="关闭结果预览"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="max-h-[calc(86vh-96px)] overflow-y-auto bg-[#f8fbff] px-7 py-6">
                          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-8 text-slate-700">
                              {generatedResultPreview.content}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )
                : null}

              <div
                id="image-export-preview"
                className="pointer-events-none fixed left-[-99999px] top-0 z-[-1]"
                style={{ width: `${exportPreviewWidthPx}px` }}
              >
                <div
                  className="relative w-full"
                  style={{
                    minHeight: `${exportPreviewHeightPx}px`,
                    height: `${exportPreviewHeightPx}px`,
                  }}
                >
                  <div
                    className="resume-preview-page absolute left-0 top-0 w-full overflow-hidden bg-white"
                    ref={(node) => {
                      imageExportPageRefs.current[0] = node;
                    }}
                    style={{
                      aspectRatio: "210 / 297",
                      minHeight: `${exportPreviewHeightPx}px`,
                      height: `${exportPreviewHeightPx}px`,
                    }}
                  >
                    <div
                      className="absolute overflow-hidden"
                      style={{
                        top: `${previewVerticalMarginPx}px`,
                        bottom: `${previewVerticalMarginPx}px`,
                        left: `${previewHorizontalMarginPx}px`,
                        right: `${previewHorizontalMarginPx}px`,
                        height: `${previewPaginatedBodyHeightPx}px`,
                      }}
                    >
                      {renderPreviewSections({ highlightActive: false })}
                    </div>
                  </div>
                </div>
              </div>

              <div
                id="print-export-preview"
                className="pointer-events-none fixed left-[-99999px] top-0 z-[-1]"
                style={{ width: `${exportPreviewWidthPx}px` }}
              >
                <div
                  className="relative w-full"
                  style={{
                    minHeight: `${exportPreviewHeightPx}px`,
                    height: `${previewStackHeightPx}px`,
                  }}
                >
                  {Array.from({ length: previewPageCount }).map((_, pageIndex) => {
                    const currentOffset = previewPageOffsetsPx[pageIndex] ?? 0;
                    const nextOffset = previewPageOffsetsPx[pageIndex + 1] ?? previewContentHeightPx;
                    const sliceHeight = Math.max(
                      0,
                      Math.min(previewPageBodyHeightPx || nextOffset - currentOffset, nextOffset - currentOffset),
                    );

                    return (
                      <div
                        key={`print-preview-paper-${pageIndex}`}
                        className="print-page absolute left-0 w-full overflow-hidden bg-white"
                        ref={(node) => {
                          printPageRefs.current[pageIndex] = node;
                        }}
                        style={{
                          aspectRatio: "210 / 297",
                          top:
                            previewPageHeightPx > 0
                              ? `${(previewPageHeightPx + PREVIEW_PAGE_GAP_PX) * pageIndex}px`
                              : undefined,
                          minHeight: previewPageHeightPx > 0 ? `${previewPageHeightPx}px` : undefined,
                          height: previewPageHeightPx > 0 ? `${previewPageHeightPx}px` : undefined,
                        }}
                      >
                        <div
                          className="print-page-canvas relative h-full w-full"
                          style={{
                            width: "210mm",
                            height: "297mm",
                          }}
                        >
                        <div
                          className="absolute overflow-hidden"
                          style={{
                            top: `${previewVerticalMarginPx}px`,
                            height: `${sliceHeight}px`,
                            left: `${previewHorizontalMarginPx}px`,
                            right: `${previewHorizontalMarginPx}px`,
                          }}
                        >
                            <div style={{ transform: `translateY(-${currentOffset}px)` }}>
                              {renderPreviewSections({ highlightActive: false })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {viewMode === "debug" ? (
          <section className="rounded-3xl border border-slate-200 bg-[#f7faff]/96 p-6 shadow-2xl shadow-blue-200/60 backdrop-blur">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-800">Draft JSON</h2>
                <div className="min-h-64 rounded-2xl border border-dashed border-slate-300 bg-white/88 p-4 text-xs leading-6 text-slate-800">
                  {draftResumeJson ? (
                    <pre className="whitespace-pre-wrap font-mono">{draftResumeJson}</pre>
                  ) : (
                    <p className="text-slate-500">Draft JSON 生成后会显示在这里。</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-800">Memory Writer API 返回结果</h2>
                <div className="min-h-64 rounded-2xl border border-dashed border-slate-300 bg-white/88 p-4 text-xs leading-6 text-slate-800">
                  {debugMemoryWriterResults.length > 0 ? (
                    <pre className="whitespace-pre-wrap font-mono">
                      {JSON.stringify(debugMemoryWriterResults, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-slate-500">提交全局差距分发表单后，这里会显示 Memory Writer API 的结构化返回结果。</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-800">Optimize API 输出的最终效果</h2>
                <div className="min-h-64 rounded-2xl border border-dashed border-slate-300 bg-white/88 p-4 text-xs leading-6 text-slate-800">
                  {debugOptimizeResults.length > 0 ? (
                    <pre className="whitespace-pre-wrap font-mono">
                      {JSON.stringify(debugOptimizeResults, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-slate-500">提交全局差距分发表单并完成自动优化后，这里会显示 Optimize API 的最终输出结果。</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-800">邮件求职信结果</h2>
                <div className="min-h-64 rounded-2xl border border-dashed border-slate-300 bg-white/88 p-4 text-xs leading-6 text-slate-800">
                  {coverLetterAsset.status === "running" ? (
                    <p className="text-slate-500">正在生成邮件求职信...</p>
                  ) : coverLetterAsset.status === "error" ? (
                    <p className="text-rose-500">{coverLetterAsset.error || "邮件求职信生成失败"}</p>
                  ) : coverLetterAsset.content ? (
                    <pre className="whitespace-pre-wrap font-sans">{coverLetterAsset.content}</pre>
                  ) : (
                    <p className="text-slate-500">邮件求职信生成后会显示在这里。</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-800">Boss 打招呼语结果</h2>
                <div className="min-h-64 rounded-2xl border border-dashed border-slate-300 bg-white/88 p-4 text-xs leading-6 text-slate-800">
                  {bossGreetingAsset.status === "running" ? (
                    <p className="text-slate-500">正在生成 Boss 打招呼语...</p>
                  ) : bossGreetingAsset.status === "error" ? (
                    <p className="text-rose-500">{bossGreetingAsset.error || "Boss 打招呼语生成失败"}</p>
                  ) : bossGreetingAsset.content ? (
                    <pre className="whitespace-pre-wrap font-sans">{bossGreetingAsset.content}</pre>
                  ) : (
                    <p className="text-slate-500">Boss 打招呼语生成后会显示在这里。</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-3xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm leading-6 text-rose-200">
            {error}
          </section>
        ) : null}
      </div>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            width: 210mm !important;
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body * {
            visibility: hidden !important;
          }

          #print-export-preview,
          #print-export-preview * {
            visibility: visible !important;
          }

          #print-export-preview {
            position: fixed !important;
            inset: 0 auto auto 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            z-index: 1 !important;
            display: block !important;
            overflow: visible !important;
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            opacity: 1 !important;
            pointer-events: none !important;
            transform: none !important;
          }

          #print-export-preview > div {
            position: relative !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          #print-export-preview .print-page {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            display: block !important;
            width: 210mm !important;
            min-height: 297mm !important;
            height: 297mm !important;
            margin: 0 !important;
            overflow: hidden !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
            break-inside: avoid;
            page-break-inside: avoid;
          }

          #print-export-preview .print-page-canvas {
            position: relative !important;
            width: 210mm !important;
            height: 297mm !important;
            transform: none !important;
          }

          #print-export-preview .print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>
    </main>
  );
}

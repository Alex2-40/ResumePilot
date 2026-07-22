export type JdInput = {
  raw_text?: string;
  job_title?: string;
  company?: string;
  hard_skills?: string[];
  soft_skills?: string[];
  responsibilities?: string[];
  requirements?: string[];
  keywords?: string[];
  high_frequency_verbs?: string[];
  core_competencies?: string[];
  experience_level?: string;
  education_requirement?: string;
  summary?: string;
};

export const EMPTY_JD_INPUT: Required<JdInput> = {
  raw_text: "",
  job_title: "",
  company: "",
  hard_skills: [],
  soft_skills: [],
  responsibilities: [],
  requirements: [],
  keywords: [],
  high_frequency_verbs: [],
  core_competencies: [],
  experience_level: "",
  education_requirement: "",
  summary: "",
};

export const JD_JSON_SCHEMA_TEMPLATE = `{
  "raw_text": "",
  "job_title": "",
  "company": "",
  "hard_skills": [],
  "soft_skills": [],
  "responsibilities": [],
  "requirements": [],
  "keywords": [],
  "high_frequency_verbs": [],
  "core_competencies": [],
  "experience_level": "",
  "education_requirement": "",
  "summary": ""
}`;

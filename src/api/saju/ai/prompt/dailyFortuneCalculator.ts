// Daily fortune deterministic calculator for frontend/server reuse
// Mirrors the prompt's scoring rules to reduce LLM reasoning load

export type FiveElement = "wood" | "fire" | "earth" | "metal" | "water";

export interface SajuInput {
  사주: {
    일주: string; // e.g., "乙巳"
    월주?: string;
    년주?: string;
    시주?: string;
  };
  현재: {
    대운: string; // e.g., "丙辰"
    세운: string; // e.g., "乙巳"
    월운: string; // e.g., "乙酉"
    일운: string; // e.g., "庚戌"
  };
  오행별왕쇠?: { [han: string]: string }; // { "木":"상","火":"수","土":"사","金":"휴","水":"왕" }
  오행별비중?: { [han: string]: string | number }; // { "木":"16.7%", ... }
}

export interface CategoryScore {
  key:
    | "love"
    | "health"
    | "wealth"
    | "work"
    | "study"
    | "social"
    | "creativity";
  label: string;
  score: number;
}

export interface CalculateResult {
  overallScore: number;
  categories: CategoryScore[];
  elementsStrength: Record<FiveElement, number>; // normalized to sum=1
}

const STEM_TO_ELEMENT: Record<string, FiveElement> = {
  "甲": "wood",
  "乙": "wood",
  "丙": "fire",
  "丁": "fire",
  "戊": "earth",
  "己": "earth",
  "庚": "metal",
  "辛": "metal",
  "壬": "water",
  "癸": "water",
};

const BRANCH_TO_ELEMENT: Record<string, FiveElement> = {
  "子": "water",
  "丑": "earth",
  "寅": "wood",
  "卯": "wood",
  "辰": "earth",
  "巳": "fire",
  "午": "fire",
  "未": "earth",
  "申": "metal",
  "酉": "metal",
  "戌": "earth",
  "亥": "water",
};

const ELEMENT_LABEL: Record<FiveElement, string> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
};

const CATEGORY_LABELS: Record<CalculateResult["categories"][number]["key"], string> = {
  love: "연애",
  health: "건강",
  wealth: "재물",
  work: "직장",
  study: "학업",
  social: "대인관계",
  creativity: "창의력",
};

const WEIGHT運 = { day: 0.6, month: 0.2, year: 0.15, decade: 0.05 } as const;
const WEIGHT_COMPONENT = { stem: 0.55, branch: 0.45 } as const;

// Category weights for element influence (ElementsModifier)
const CATEGORY_ELEMENT_WEIGHTS: Record<CalculateResult["categories"][number]["key"], Partial<Record<FiveElement, number>>> = {
  love: { wood: 0.4, water: 0.3, fire: 0.2, metal: -0.2, earth: -0.1 },
  health: { earth: 0.4, water: 0.3, fire: -0.2, metal: -0.1 },
  wealth: { earth: 0.5, water: 0.2, metal: -0.2, fire: -0.1 },
  work: { metal: 0.4, earth: 0.2, water: 0.1, fire: -0.3 },
  study: { water: 0.4, wood: 0.3, fire: -0.2 },
  social: { wood: 0.4, water: 0.3, metal: -0.3 },
  creativity: { fire: 0.5, wood: 0.3, earth: -0.2 },
};

// Category sensitivity for DayEdgeModifier
const CATEGORY_DAY_FACTOR: Record<CalculateResult["categories"][number]["key"], number> = {
  love: 1.0,
  health: 0.8,
  wealth: 1.0,
  work: 1.2,
  study: 0.9,
  social: 1.1,
  creativity: 1.2,
};

// Optional 왕쇠 multipliers
const WANGSHUAI_MULTIPLIER: Record<string, number> = {
  "왕": 1.2,
  "상": 1.1,
  "평": 1.0,
  "휴": 0.9,
  "수": 0.8,
  "사": 0.7,
};

function getElementFromStem(stem: string | undefined): FiveElement | undefined {
  if (!stem) return undefined;
  return STEM_TO_ELEMENT[stem] as FiveElement | undefined;
}

function getElementFromBranch(branch: string | undefined): FiveElement | undefined {
  if (!branch) return undefined;
  return BRANCH_TO_ELEMENT[branch] as FiveElement | undefined;
}

function parseGanZhi(gz: string): { stem?: string; branch?: string } {
  if (!gz) return {};
  const s = gz.trim();
  // Expect 2 characters (stem, branch). If longer, take first two recognizable.
  const chars = Array.from(s);
  let stem: string | undefined;
  let branch: string | undefined;
  for (const ch of chars) {
    if (!stem && STEM_TO_ELEMENT[ch]) {
      stem = ch;
    } else if (!branch && BRANCH_TO_ELEMENT[ch]) {
      branch = ch;
    }
    if (stem && branch) break;
  }
  return { stem, branch };
}

function generates(a: FiveElement, b: FiveElement): boolean {
  return (
    (a === "wood" && b === "fire") ||
    (a === "fire" && b === "earth") ||
    (a === "earth" && b === "metal") ||
    (a === "metal" && b === "water") ||
    (a === "water" && b === "wood")
  );
}

function controls(a: FiveElement, b: FiveElement): boolean {
  return (
    (a === "wood" && b === "earth") ||
    (a === "earth" && b === "water") ||
    (a === "water" && b === "fire") ||
    (a === "fire" && b === "metal") ||
    (a === "metal" && b === "wood")
  );
}

function relationScore(inputEl: FiveElement, dayEl: FiveElement): number {
  if (inputEl === dayEl) return 2; // 동기
  if (generates(inputEl, dayEl)) return 3; // 입력이 일간을 생조
  if (generates(dayEl, inputEl)) return -1; // 일간이 입력을 생泄
  if (controls(inputEl, dayEl)) return -3; // 입력이 일간 극
  if (controls(dayEl, inputEl)) return -2; // 내가 극함
  return 0; // 무관
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function normalizeVector(vec: Record<FiveElement, number>): Record<FiveElement, number> {
  const sum = Object.values(vec).reduce((a, b) => a + b, 0) || 1;
  const out = { ...vec } as Record<FiveElement, number>;
  (Object.keys(out) as FiveElement[]).forEach((k) => {
    out[k] = out[k] / sum;
  });
  return out;
}

function parsePercentInput(map?: { [han: string]: string | number }): Record<FiveElement, number> | undefined {
  if (!map) return undefined;
  const out: Record<FiveElement, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  (Object.keys(out) as FiveElement[]).forEach((el) => {
    const han = ELEMENT_LABEL[el];
    const raw = map[han];
    if (raw === undefined) return;
    let v = 0;
    if (typeof raw === "string") {
      const s = raw.trim().replace(/%$/, "");
      const num = parseFloat(s);
      if (!isNaN(num)) v = num / 100;
    } else if (typeof raw === "number") {
      v = raw > 1 ? raw / 100 : raw;
    }
    out[el] = v;
  });
  return normalizeVector(out);
}

function getWangshuaiMultiplier(hanStateMap?: { [han: string]: string }, el?: FiveElement): number {
  if (!hanStateMap || !el) return 1;
  const han = ELEMENT_LABEL[el];
  const state = hanStateMap[han];
  if (!state) return 1;
  return WANGSHUAI_MULTIPLIER[state] ?? 1;
}

export function calculateDailyFortuneScores(input: SajuInput): CalculateResult {
  // 1) Identify day master element from 일주 천간
  const dayStem = parseGanZhi(input.사주.일주).stem;
  const dayElement = getElementFromStem(dayStem!);
  if (!dayElement) {
    throw new Error("일주의 천간을 인식할 수 없습니다.");
  }

  // 2) For each 운, compute stem/branch relation scores (with 왕쇠 multiplier if provided)
  const 운List = [
    { key: "day", value: input.현재.일운 },
    { key: "month", value: input.현재.월운 },
    { key: "year", value: input.현재.세운 },
    { key: "decade", value: input.현재.대운 },
  ] as const;

  type 운Key = typeof 운List[number]["key"];

  const relationBy運: Record<운Key, { stem: number; branch: number; combined: number }> = {
    day: { stem: 0, branch: 0, combined: 0 },
    month: { stem: 0, branch: 0, combined: 0 },
    year: { stem: 0, branch: 0, combined: 0 },
    decade: { stem: 0, branch: 0, combined: 0 },
  };

  const strengthAccumulator: Record<FiveElement, number> = {
    wood: 0,
    fire: 0,
    earth: 0,
    metal: 0,
    water: 0,
  };

  for (const item of 운List) {
    const { stem, branch } = parseGanZhi(item.value);
    const stemEl = getElementFromStem(stem!);
    const branchEl = getElementFromBranch(branch!);

    // ElementsStrength accumulation (no 왕쇠 here)
    if (stemEl) strengthAccumulator[stemEl] += WEIGHT_COMPONENT.stem * WEIGHT運[item.key];
    if (branchEl) strengthAccumulator[branchEl] += WEIGHT_COMPONENT.branch * WEIGHT運[item.key];

    // Relation scores with 왕쇠 multiplier
    const stemRel = stemEl ? relationScore(stemEl, dayElement) * getWangshuaiMultiplier(input.오행별왕쇠, stemEl) : 0;
    const branchRel = branchEl ? relationScore(branchEl, dayElement) * getWangshuaiMultiplier(input.오행별왕쇠, branchEl) : 0;
    const combined = stemRel * WEIGHT_COMPONENT.stem + branchRel * WEIGHT_COMPONENT.branch;
    relationBy運[item.key] = { stem: stemRel, branch: branchRel, combined };
  }

  // 3) SupportIndex and overallScore
  const supportIndex =
    relationBy運.day.combined * WEIGHT運.day +
    relationBy運.month.combined * WEIGHT運.month +
    relationBy運.year.combined * WEIGHT運.year +
    relationBy運.decade.combined * WEIGHT運.decade;

  const overallRaw = 50 + 14 * supportIndex;
  const overallScore = roundTo5(clamp(overallRaw, 0, 100));

  // 4) ElementsStrength normalized; mix with optional input proportion
  let elementsStrength = normalizeVector(strengthAccumulator);
  const inputProportion = parsePercentInput(input.오행별비중);
  if (inputProportion) {
    const mixed: Record<FiveElement, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
    (Object.keys(mixed) as FiveElement[]).forEach((k) => {
      mixed[k] = 0.5 * elementsStrength[k] + 0.5 * inputProportion[k];
    });
    elementsStrength = normalizeVector(mixed);
  }

  // 5) DayEdgeRaw (일운만)
  const dayEdgeRaw = relationBy運.day.stem * 0.6 + relationBy運.day.branch * 0.4;

  // 6) Category scores
  const elementsModifierScale = 18; // as per prompt
  const dayEdgeScale = 6; // as per prompt

  const categories: CategoryScore[] = [];
  const tempScores: number[] = [];
  const dayEdgeModifiers: number[] = [];

  (Object.keys(CATEGORY_LABELS) as CategoryScore["key"][]).forEach((key) => {
    const label = CATEGORY_LABELS[key];
    const elementWeights = CATEGORY_ELEMENT_WEIGHTS[key];
    const categoryDayFactor = CATEGORY_DAY_FACTOR[key];

    let elementsModifier = 0;
    (Object.keys(elementsStrength) as FiveElement[]).forEach((el) => {
      const w = elementWeights[el] ?? 0;
      elementsModifier += w * elementsStrength[el];
    });
    elementsModifier *= elementsModifierScale;

    const dayEdgeModifier = dayEdgeScale * dayEdgeRaw * categoryDayFactor;

    const base = overallScore;
    const score = roundTo5(clamp(base + elementsModifier + dayEdgeModifier, 0, 100));

    categories.push({ key, label, score });
    tempScores.push(score);
    dayEdgeModifiers.push(dayEdgeModifier);
  });

  // 7) Variance safeguard
  const uniqueCount = new Set(tempScores).size;
  const mean = tempScores.reduce((a, b) => a + b, 0) / tempScores.length;
  const variance = tempScores.reduce((a, b) => a + (b - mean) * (b - mean), 0) / tempScores.length;
  const stddev = Math.sqrt(variance);
  if (stddev < 8 || uniqueCount < 4) {
    // rank by dayEdgeModifier
    const idx = categories.map((_, i) => i);
    idx.sort((a, b) => dayEdgeModifiers[b] - dayEdgeModifiers[a]);
    const top2 = idx.slice(0, 2);
    const bottom2 = idx.slice(-2);
    const adjust = (i: number, delta: number) => {
      const s = clamp(categories[i].score + delta, 0, 100);
      categories[i].score = roundTo5(s);
    };
    top2.forEach((i) => adjust(i, 5));
    bottom2.forEach((i) => adjust(i, -5));
  }

  return { overallScore, categories, elementsStrength };
}



// Estate Standard - AI Triage Service
// Rules-based triage for MVP (pluggable for LLM in V1)

import { RequestUrgency } from '@prisma/client';

export interface TriageResult {
  urgency: RequestUrgency;
  detectedCategory: string | null;
  replacementNeeded: boolean;
  triageNotes: string;
  suggestedResponse?: string;
  escalate: boolean;
}

export interface TriageInput {
  title: string;
  description: string;
  categoryName?: string;
}

// ============================================================================
// URGENCY DETECTION
// ============================================================================

const CRITICAL_KEYWORDS = [
  'gas leak',
  'smell gas',
  'flooding',
  'flood',
  'sparks',
  'fire',
  'smoke',
  'electrical shock',
  'burst pipe',
  'no heat',
  'freezing',
  'no water',
  'sewage',
  'carbon monoxide',
];

const HIGH_KEYWORDS = [
  'leak',
  'leaking',
  'broken',
  'not working',
  'urgent',
  'emergency',
  'help',
  'immediately',
  'asap',
  'won\'t start',
  'stopped working',
];

const LOW_KEYWORDS = [
  'eventually',
  'when you can',
  'cosmetic',
  'planning',
  'thinking about',
  'future',
  'quote',
  'estimate',
];

// ============================================================================
// CATEGORY DETECTION
// ============================================================================

const CATEGORY_PATTERNS: Record<string, string[]> = {
  hvac: ['ac', 'air conditioning', 'heat', 'heating', 'furnace', 'thermostat', 'vent', 'filter'],
  plumbing: ['toilet', 'faucet', 'pipe', 'leak', 'drain', 'water heater', 'sink', 'shower', 'bath'],
  electrical: ['outlet', 'breaker', 'wiring', 'light', 'switch', 'power', 'electrical', 'voltage'],
  landscaping: ['mow', 'lawn', 'tree', 'irrigation', 'sprinkler', 'grass', 'yard', 'garden'],
  roof: ['roof', 'shingle', 'leak from ceiling', 'attic leak', 'gutter'],
  'gutters-downspouts': ['gutter', 'downspout', 'overflow'],
  'garage-overhead-door': ['garage door', 'opener', 'garage'],
  appliances: ['refrigerator', 'dishwasher', 'washer', 'dryer', 'oven', 'stove', 'microwave'],
  'smoke-detectors': ['smoke detector', 'alarm', 'co detector', 'carbon monoxide'],
  'doors-locks': ['door', 'lock', 'deadbolt', 'handle', 'hinge'],
  'windows-screens-patio-doors': ['window', 'screen', 'patio door', 'sliding door'],
};

// ============================================================================
// REPLACEMENT DETECTION
// ============================================================================

const REPLACEMENT_KEYWORDS = [
  'replace',
  'replacement',
  'new unit',
  'install new',
  'purchase',
  'buy new',
  'need new',
  'get new',
  'old and',
  'worn out',
  'beyond repair',
  'total loss',
];

// ============================================================================
// SENTIMENT & ESCALATION
// ============================================================================

const ESCALATION_KEYWORDS = [
  'lawyer',
  'attorney',
  'sue',
  'legal action',
  'better business bureau',
  'bbb',
  'review',
  'yelp',
  'google review',
  'complaint',
  'unacceptable',
  'disgusted',
  'furious',
  'scam',
  'fraud',
];

// ============================================================================
// MAIN TRIAGE FUNCTION
// ============================================================================

export async function triageServiceRequest(
  input: TriageInput
): Promise<TriageResult> {
  const text = `${input.title} ${input.description}`.toLowerCase();

  // 1. Detect urgency
  const urgency = detectUrgency(text);

  // 2. Detect category
  const detectedCategory = detectCategory(text, input.categoryName);

  // 3. Detect replacement need
  const replacementNeeded = detectReplacement(text);

  // 4. Check for escalation
  const escalate = detectEscalation(text);

  // 5. Generate triage notes
  const triageNotes = generateTriageNotes(urgency, detectedCategory, replacementNeeded, escalate);

  // 6. Suggested response (calm, professional)
  const suggestedResponse = generateSuggestedResponse(urgency, escalate);

  return {
    urgency,
    detectedCategory,
    replacementNeeded,
    triageNotes,
    suggestedResponse,
    escalate,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function detectUrgency(text: string): RequestUrgency {
  // Check for critical keywords
  for (const keyword of CRITICAL_KEYWORDS) {
    if (text.includes(keyword)) {
      return 'CRITICAL';
    }
  }

  // Check for high priority
  for (const keyword of HIGH_KEYWORDS) {
    if (text.includes(keyword)) {
      return 'HIGH';
    }
  }

  // Check for low priority
  for (const keyword of LOW_KEYWORDS) {
    if (text.includes(keyword)) {
      return 'LOW';
    }
  }

  return 'NORMAL';
}

function detectCategory(text: string, providedCategory?: string): string | null {
  if (providedCategory) {
    return providedCategory;
  }

  let bestMatch: string | null = null;
  let maxMatches = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_PATTERNS)) {
    let matches = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matches++;
      }
    }

    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = category;
    }
  }

  return bestMatch;
}

function detectReplacement(text: string): boolean {
  for (const keyword of REPLACEMENT_KEYWORDS) {
    if (text.includes(keyword)) {
      return true;
    }
  }
  return false;
}

function detectEscalation(text: string): boolean {
  for (const keyword of ESCALATION_KEYWORDS) {
    if (text.includes(keyword)) {
      return true;
    }
  }
  return false;
}

function generateTriageNotes(
  urgency: RequestUrgency,
  category: string | null,
  replacement: boolean,
  escalate: boolean
): string {
  const notes: string[] = [];

  notes.push(`Urgency: ${urgency}`);

  if (category) {
    notes.push(`Detected category: ${category}`);
  }

  if (replacement) {
    notes.push('Replacement may be needed - warranty tracking enabled');
  }

  if (escalate) {
    notes.push('⚠️ ESCALATE: Detected legal threat or extreme dissatisfaction');
  }

  return notes.join('. ');
}

function generateSuggestedResponse(
  urgency: RequestUrgency,
  escalate: boolean
): string {
  if (escalate) {
    return "We understand your concerns and take this matter seriously. A senior member of our team will reach out to you within the hour to personally address this.";
  }

  switch (urgency) {
    case 'CRITICAL':
      return "We've received your urgent request and are treating it as a priority. Our team is working to connect you with an emergency service provider immediately. You should expect contact within the next 15 minutes.";

    case 'HIGH':
      return "We've received your service request and understand the urgency. We're matching you with qualified vendors who can address this today. You'll see recommendations shortly.";

    case 'NORMAL':
      return "We've received your request and will have vendor recommendations for you within a few hours. We'll handle the details from here.";

    case 'LOW':
      return "We've received your request. We'll gather some options and follow up with you in the next day or two.";

    default:
      return "We've received your request and will be in touch soon.";
  }
}

// ============================================================================
// FUTURE: LLM-BASED TRIAGE (V1)
// ============================================================================

/**
 * Placeholder for future OpenAI integration
 *
 * async function triageWithLLM(input: TriageInput): Promise<TriageResult> {
 *   const completion = await openai.chat.completions.create({
 *     model: 'gpt-4',
 *     messages: [
 *       { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
 *       { role: 'user', content: JSON.stringify(input) }
 *     ],
 *     response_format: { type: 'json_object' }
 *   });
 *
 *   return JSON.parse(completion.choices[0].message.content);
 * }
 */

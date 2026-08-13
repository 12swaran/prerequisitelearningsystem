import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { GoogleGenAI, Type } from "@google/genai";

// Define the state schema
export const StateAnnotation = Annotation.Root({
  target_concept: Annotation<string>,
  prerequisites: Annotation<string[]>,
  current_index: Annotation<number>,
  mastery: Annotation<Record<string, "unknown" | "verified" | "skipped">>,
  current_explanation: Annotation<string>,
  current_example: Annotation<string>,
  current_quiz: Annotation<{
    questions: {
      question: string;
      options: string[];
      correctIndex: number;
    }[];
  } | null>,
  quiz_answers: Annotation<number[]>,
  quiz_score: Annotation<number | null>,
  error: Annotation<string | null>,
  is_completed: Annotation<boolean>,
  action: Annotation<"init" | "submit_quiz" | "skip" | "next_concept" | "none">,
  api_key: Annotation<string | undefined>,
});

export type PathfinderState = typeof StateAnnotation.State;

// Candidate models for seamless fallback on rate limits
const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-flash-latest"
];

// Helper to initialize Google GenAI SDK
export function getAIClient(customKey?: string) {
  const key = customKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("Missing Gemini API Key. Please provide your GEMINI_API_KEY in .env.local or enter it in the app.");
  }
  return new GoogleGenAI({ apiKey: key });
}

// Generate with automatic model fallback for 429 quota errors
export async function generateWithFallback(
  ai: GoogleGenAI, 
  contents: string, 
  schema: any
): Promise<string> {
  let lastError: any = null;

  for (const model of FALLBACK_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });
      if (response.text) {
        return response.text;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} failed: ${err.message?.slice(0, 100)} — trying fallback...`);
    }
  }

  throw lastError || new Error("Failed to generate content with all available AI models.");
}

// Robust JSON parser helper
export function safeParseJson<T>(rawText: string | undefined): T {
  if (!rawText) {
    throw new Error("Empty response received from AI model.");
  }
  let text = rawText.trim();
  if (text.startsWith("```json")) {
    text = text.slice(7);
  } else if (text.startsWith("```")) {
    text = text.slice(3);
  }
  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }
  text = text.trim();

  return JSON.parse(text) as T;
}

// Nodes

async function generateChainNode(state: PathfinderState): Promise<Partial<PathfinderState>> {
  try {
    const ai = getAIClient(state.api_key);

    const rawText = await generateWithFallback(
      ai,
      `You are an expert curriculum designer and educator.
Break down the target concept '${state.target_concept}' into a linear, sequential, step-by-step list of 3 to 6 prerequisite concepts.
Start with the fundamental foundations and build progressively towards mastering '${state.target_concept}'.`,
      {
        type: Type.OBJECT,
        properties: {
          prerequisites: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A linear, ordered list of 3-6 prerequisite concepts from absolute fundamentals to the target concept."
          }
        },
        required: ["prerequisites"]
      }
    );

    const parsed = safeParseJson<{ prerequisites: string[] }>(rawText);

    return {
      prerequisites: parsed.prerequisites,
      current_index: 0,
      mastery: {},
      is_completed: false,
      error: null,
    };
  } catch (error: any) {
    return { error: error.message || "Failed to generate prerequisite chain." };
  }
}

async function presentConceptNode(state: PathfinderState): Promise<Partial<PathfinderState>> {
  if (state.current_index >= (state.prerequisites?.length || 0)) {
    return { is_completed: true };
  }

  const currentConcept = state.prerequisites[state.current_index];

  // Shortcut: if pre-fetched content is already in the state, just use it
  if (state.current_explanation && state.current_example && state.current_quiz) {
    return {
      current_explanation: state.current_explanation,
      current_example: state.current_example,
      current_quiz: state.current_quiz,
      quiz_answers: [],
      quiz_score: null,
      error: null,
    };
  }

  try {
    const ai = getAIClient(state.api_key);

    const mastered = Object.keys(state.mastery || {}).filter((k) => state.mastery[k] === "verified" || state.mastery[k] === "skipped").join(", ") || "None (First Step)";

    const rawText = await generateWithFallback(
      ai,
      `You are an expert tutor teaching the concept: '${currentConcept}'.
Target subject: '${state.target_concept}'.
Concepts mastered so far: ${mastered}.

Requirements:
1. Explanation: Provide a comprehensive yet concise explanation. Use clear Markdown formatting with headings, bullet points, bold key terms, and well-aligned code blocks (with language identifiers like \`\`\`python) when applicable.
2. Example: Give a practical, real-world scenario or clean code snippet illustrating how this concept works in practice.
3. Quiz: Create 3 high-quality multiple choice questions (with 4 distinct options each) to verify understanding.`,
      {
        type: Type.OBJECT,
        properties: {
          explanation: { 
            type: Type.STRING,
            description: "A clear, structured explanation with formatted markdown, bold key terms, and code snippets if applicable."
          },
          example: { 
            type: Type.STRING,
            description: "A concrete real-world example with realistic context or code demonstration in markdown format."
          },
          quiz: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    correctIndex: { type: Type.INTEGER }
                  },
                  required: ["question", "options", "correctIndex"]
                }
              }
            },
            required: ["questions"]
          }
        },
        required: ["explanation", "example", "quiz"]
      }
    );

    const parsed = safeParseJson<{
      explanation: string;
      example: string;
      quiz: {
        questions: {
          question: string;
          options: string[];
          correctIndex: number;
        }[];
      };
    }>(rawText);

    return {
      current_explanation: parsed.explanation,
      current_example: parsed.example,
      current_quiz: parsed.quiz,
      quiz_answers: [],
      quiz_score: null,
      error: null,
    };
  } catch (error: any) {
    return { error: error.message || "Failed to generate concept material." };
  }
}

async function assessAnswerNode(state: PathfinderState): Promise<Partial<PathfinderState>> {
  const currentConcept = state.prerequisites[state.current_index];
  const quiz = state.current_quiz;
  const answers = state.quiz_answers;

  if (!quiz || !answers || answers.length !== quiz.questions.length) {
    return { error: "Invalid quiz submission." };
  }

  let correctCount = 0;
  for (let i = 0; i < quiz.questions.length; i++) {
    if (answers[i] === quiz.questions[i].correctIndex) {
      correctCount++;
    }
  }

  const score = correctCount / quiz.questions.length;
  const newMastery = { ...(state.mastery || {}) };

  if (score >= 0.66) {
    newMastery[currentConcept] = "verified";
  } else {
    newMastery[currentConcept] = "unknown";
  }

  return {
    mastery: newMastery,
    quiz_score: score,
    error: null,
  };
}

async function skipConceptNode(state: PathfinderState): Promise<Partial<PathfinderState>> {
  const currentConcept = state.prerequisites[state.current_index];
  const newMastery = { ...(state.mastery || {}) };
  newMastery[currentConcept] = "skipped";
  const nextIdx = (state.current_index || 0) + 1;
  
  return {
    mastery: newMastery,
    current_index: nextIdx,
    quiz_score: null,
    quiz_answers: [],
    error: null,
  };
}

async function nextConceptNode(state: PathfinderState): Promise<Partial<PathfinderState>> {
  const nextIdx = (state.current_index || 0) + 1;
  return {
    current_index: nextIdx,
    quiz_score: null,
    quiz_answers: [],
    error: null,
  };
}

async function completedNode(state: PathfinderState): Promise<Partial<PathfinderState>> {
  return {
    is_completed: true,
  };
}

// Routing Logic
function routeFromStart(state: PathfinderState) {
  if (state.action === "init") return "generateChain";
  if (state.action === "submit_quiz") return "assessAnswer";
  if (state.action === "skip") return "skipConcept";
  if (state.action === "next_concept") return "nextConcept";
  return END;
}

function checkStepCompletion(state: PathfinderState) {
  if (state.error) return END;
  if ((state.current_index || 0) >= (state.prerequisites?.length || 0)) {
    return "completed";
  }
  return "presentConcept";
}

// Build Workflow
const finalWorkflow = new StateGraph(StateAnnotation)
  .addNode("generateChain", generateChainNode)
  .addNode("presentConcept", presentConceptNode)
  .addNode("assessAnswer", assessAnswerNode)
  .addNode("skipConcept", skipConceptNode)
  .addNode("nextConcept", nextConceptNode)
  .addNode("completed", completedNode)
  
  .addConditionalEdges(START, routeFromStart)
  
  // After generating the chain, proceed to present concept 0
  .addEdge("generateChain", "presentConcept")
  .addEdge("presentConcept", END)
  
  // After evaluating a quiz, end turn to show results screen to user
  .addEdge("assessAnswer", END)
  
  // After skipping or advancing to next concept, check if all concepts are completed or present next
  .addConditionalEdges("skipConcept", checkStepCompletion)
  .addConditionalEdges("nextConcept", checkStepCompletion)
  
  .addEdge("completed", END);

export const appGraph = finalWorkflow.compile();

import { NextRequest, NextResponse } from "next/server";
import { getAIClient, generateWithFallback, safeParseJson } from "@/lib/langgraph";
import { Type } from "@google/genai";

export const maxDuration = 60; // Allow up to 60 seconds for LLM responses

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { target_concept, concept_name, mastered_list } = body as {
      target_concept: string;
      concept_name: string;
      mastered_list: string;
    };

    if (!concept_name || !target_concept) {
      return NextResponse.json({ error: "Missing required fields for prefetch" }, { status: 400 });
    }

    // Extract API key if sent in header
    const customKey = req.headers.get("x-gemini-key") || undefined;
    const ai = getAIClient(customKey);

    const mastered = mastered_list || "None";

    const rawText = await generateWithFallback(
      ai,
      `You are an expert tutor teaching the concept: '${concept_name}'.
Target subject: '${target_concept}'.
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
      quiz: any;
    }>(rawText);

    return NextResponse.json({ 
      explanation: parsed.explanation, 
      example: parsed.example, 
      quiz: parsed.quiz 
    });
  } catch (error: any) {
    console.error("Prefetch error:", error);
    return NextResponse.json({ error: error.message || "Failed to prefetch concept material." }, { status: 500 });
  }
}

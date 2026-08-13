import { NextRequest, NextResponse } from "next/server";
import { appGraph, PathfinderState } from "@/lib/langgraph";

export const maxDuration = 60; // Allow up to 60 seconds for LLM responses

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { state, action } = body as { state: Partial<PathfinderState>; action: string };

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    // Extract API key if sent in header
    const customKey = req.headers.get("x-gemini-key") || undefined;

    // Prepare the state for the graph
    let initialState: any = { 
      ...state, 
      action,
      api_key: customKey || state?.api_key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    };

    // Pass state directly to LangGraph

    // Default initialization for missing fields
    if (!initialState.prerequisites) initialState.prerequisites = [];
    if (!initialState.mastery) initialState.mastery = {};
    if (initialState.current_index === undefined) initialState.current_index = 0;
    if (initialState.quiz_answers === undefined) initialState.quiz_answers = [];

    // Invoke the LangGraph workflow
    const newState = await appGraph.invoke(initialState);

    // Return the new state
    return NextResponse.json({ state: newState });
  } catch (error: any) {
    console.error("Orchestrator error:", error);
    return NextResponse.json({ error: error.message || "Failed to process state machine step." }, { status: 500 });
  }
}

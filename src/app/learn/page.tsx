"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, 
  ChevronRight, 
  Sparkles, 
  XCircle, 
  BookOpen, 
  Lock, 
  ArrowLeft,
  RotateCcw,
  KeyRound,
  HelpCircle,
  FastForward,
  RefreshCw
} from "lucide-react";
import confetti from "canvas-confetti";
import { PathfinderState } from "@/lib/langgraph";
import { FormattedContent } from "@/components/FormattedContent";

export default function LearnPage() {
  const router = useRouter();
  const [state, setState] = useState<Partial<PathfinderState> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);

  useEffect(() => {
    // Load custom API key if saved in localStorage
    const savedKey = localStorage.getItem("pathfinder_api_key");
    if (savedKey) {
      setCustomApiKey(savedKey);
    }

    // Try to load state from localStorage
    const savedState = localStorage.getItem("pathfinder_state");
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        // Only load if valid and free of errors
        if (!parsed.error && parsed.prerequisites && parsed.prerequisites.length > 0) {
          setState(parsed);
          setLoading(false);
          return;
        } else {
          localStorage.removeItem("pathfinder_state");
        }
      } catch {
        localStorage.removeItem("pathfinder_state");
      }
    }

    const target = localStorage.getItem("pathfinder_target");
    if (!target) {
      router.push("/");
      return;
    }

    // Initialize state
    callOrchestrator({ target_concept: target }, "init", savedKey || undefined);
  }, [router]);

  // Persist state when it changes and is valid
  useEffect(() => {
    if (state && !loading && !state.error && state.prerequisites && state.prerequisites.length > 0) {
      localStorage.setItem("pathfinder_state", JSON.stringify(state));
    }
  }, [state, loading]);

  // Trigger confetti when completed
  useEffect(() => {
    if (state?.is_completed) {
      try {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch (e) {
        console.log("Confetti effect:", e);
      }
    }
  }, [state?.is_completed]);

  const callOrchestrator = async (
    currentState: Partial<PathfinderState>, 
    action: string, 
    apiKeyOverride?: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const activeApiKey = apiKeyOverride !== undefined ? apiKeyOverride : customApiKey;
      const cleanState = { ...currentState };
      delete cleanState.error;

      const res = await fetch("/api/orchestrator", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(activeApiKey ? { "x-gemini-key": activeApiKey } : {})
        },
        body: JSON.stringify({ state: cleanState, action }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to contact orchestrator");
      }
      
      if (data.state?.error) {
        throw new Error(data.state.error);
      }

      setState(data.state);
      setSelectedAnswers([]); // Reset answers
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleRetryCurrent = () => {
    setError(null);
    const target = state?.target_concept || localStorage.getItem("pathfinder_target") || "Machine Learning";
    if (state?.prerequisites && state.prerequisites.length > 0 && state.current_index !== undefined) {
      callOrchestrator(state, "presentConcept" as any);
    } else {
      callOrchestrator({ target_concept: target }, "init");
    }
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customApiKey.trim()) return;
    localStorage.setItem("pathfinder_api_key", customApiKey.trim());
    setShowApiKeyInput(false);
    
    // Retry current action
    const target = state?.target_concept || localStorage.getItem("pathfinder_target") || "Machine Learning";
    if (state?.prerequisites && state.prerequisites.length > 0) {
      callOrchestrator(state, "skip", customApiKey.trim());
    } else {
      callOrchestrator({ target_concept: target }, "init", customApiKey.trim());
    }
  };

  const handleSubmitQuiz = () => {
    if (!state) return;
    if (selectedAnswers.length !== state.current_quiz?.questions.length || selectedAnswers.includes(undefined as any)) {
      alert("Please select an answer for all questions before submitting.");
      return;
    }
    callOrchestrator({ ...state, quiz_answers: selectedAnswers }, "submit_quiz");
  };

  const handleSkip = () => {
    if (!state) return;
    setSelectedAnswers([]);
    callOrchestrator({ ...state, quiz_score: null, quiz_answers: [] }, "skip");
  };
  
  const handleNextConcept = () => {
    if (!state) return;
    setSelectedAnswers([]);
    callOrchestrator({ ...state, quiz_score: null, quiz_answers: [] }, "next_concept");
  };

  const handleReset = () => {
    localStorage.removeItem("pathfinder_state");
    localStorage.removeItem("pathfinder_target");
    setState(null);
    setError(null);
    router.push("/");
  };

  const renderSkeleton = () => (
    <div className="w-full max-w-4xl mx-auto space-y-6 mt-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-1/4 bg-zinc-800/60" />
        <Skeleton className="h-2 w-full bg-zinc-800/60 rounded-full" />
      </div>
      <Card className="bg-zinc-900/60 border-zinc-800 backdrop-blur-xl shadow-2xl mt-8">
        <CardHeader>
          <Skeleton className="h-8 w-1/2 bg-zinc-800/60" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full bg-zinc-800/60" />
          <Skeleton className="h-20 w-4/5 bg-zinc-800/60" />
        </CardContent>
      </Card>
    </div>
  );

  // Error screen with diagnostics and retry
  if (error) {
    return (
      <main className="min-h-screen p-6 md:p-12 bg-zinc-950 text-zinc-50 flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />
        
        <Card className="bg-zinc-900/90 border-zinc-800 backdrop-blur-xl w-full max-w-lg shadow-2xl z-10">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <XCircle className="w-6 h-6 text-red-400" />
              </div>
              <CardTitle className="text-xl text-red-300">Notice</CardTitle>
            </div>
            <CardDescription className="text-zinc-300 font-mono text-xs bg-zinc-950/80 p-3 rounded-lg border border-zinc-800 break-words leading-relaxed">
              {error}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button onClick={handleRetryCurrent} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl h-11 font-medium">
                <RefreshCw className="w-4 h-4 mr-2" /> Retry Now
              </Button>
              <Button onClick={handleReset} variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-xl h-11">
                <RotateCcw className="w-4 h-4 mr-2" /> Start Over
              </Button>
            </div>

            <div className="border-t border-zinc-800 pt-4 mt-2">
              <form onSubmit={handleSaveApiKey} className="space-y-3">
                <label className="text-xs font-medium text-zinc-400 flex items-center gap-2">
                  <KeyRound className="w-3.5 h-3.5 text-blue-400" /> Update Gemini API Key (optional):
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    className="flex-1 h-10 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-xs"
                  />
                  <Button type="submit" size="sm" className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl px-4">
                    Save Key
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t border-zinc-800/80 pt-4">
            <Button onClick={() => router.push("/")} variant="ghost" className="text-zinc-400 hover:text-white text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Home
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  // Loading initial concept
  if (loading && !state) {
    return (
      <main className="min-h-screen p-8 bg-zinc-950 text-zinc-50 relative overflow-hidden flex flex-col items-center justify-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="text-center space-y-3 z-10 animate-pulse">
          <div className="inline-flex items-center justify-center p-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-md mb-2">
            <Sparkles className="w-7 h-7 text-blue-400 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-zinc-100">Generating Prerequisite Chain...</h2>
          <p className="text-zinc-400 max-w-md mx-auto text-base">
            LangGraph is analyzing dependencies and breaking down the concepts into progressive steps.
          </p>
        </div>
        {renderSkeleton()}
      </main>
    );
  }

  if (!state) return null;

  // Completion Screen
  if (state.is_completed) {
    return (
      <main className="min-h-screen p-6 md:p-12 bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-600/20 rounded-full blur-[160px] pointer-events-none" />
        
        <Card className="z-10 bg-zinc-900/80 border-zinc-800 backdrop-blur-2xl shadow-2xl w-full max-w-2xl">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-emerald-400" />
            </div>
            <CardTitle className="text-4xl font-extrabold bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
              Goal Achieved!
            </CardTitle>
            <CardDescription className="text-lg text-zinc-300 mt-2">
              You have successfully completed the learning journey for <strong className="text-white">{state.target_concept}</strong>.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="bg-zinc-950/60 rounded-2xl p-5 border border-zinc-800/80">
              <h3 className="text-sm font-semibold tracking-wider text-zinc-400 uppercase mb-4">Knowledge Milestones</h3>
              <div className="space-y-3">
                {state.prerequisites?.map((prereq: string, i: number) => {
                  const status = state.mastery?.[prereq];
                  return (
                    <div key={i} className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                      <div className="flex items-center gap-3">
                        {status === "verified" ? (
                          <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          </div>
                        ) : status === "skipped" ? (
                          <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <ChevronRight className="w-4 h-4 text-blue-400" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center">
                            <BookOpen className="w-4 h-4 text-zinc-400" />
                          </div>
                        )}
                        <span className="text-zinc-200 font-medium">{prereq}</span>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium uppercase tracking-wider ${
                        status === "verified" 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                          : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      }`}>
                        {status || "completed"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-4 pb-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              onClick={handleReset} 
              className="h-12 px-8 rounded-full bg-white text-black hover:bg-zinc-200 text-base font-semibold shadow-[0_0_30px_-5px_rgba(255,255,255,0.3)] transition-all"
            >
              Learn Another Topic
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  const currentConcept = state.prerequisites?.[state.current_index || 0];
  
  const isResultView = state.quiz_score !== null && state.quiz_score !== undefined;
  const passed = isResultView && (state.quiz_score || 0) >= 0.66;

  return (
    <main className="min-h-screen p-4 md:p-10 bg-zinc-950 text-zinc-50 relative overflow-hidden flex flex-col items-center">
      {/* Background glow */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-4xl z-10 flex flex-col space-y-6">
        
        {/* Top Navigation / Target Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/60 p-4 sm:px-6 rounded-2xl border border-zinc-800/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push("/")} className="text-zinc-400 hover:text-white rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <p className="text-xs uppercase tracking-widest font-semibold text-blue-400">Target Concept</p>
              <h1 className="text-xl font-bold text-zinc-100">{state.target_concept}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-xs text-zinc-400 font-medium">
              Step {(state.current_index || 0) + 1} of {state.prerequisites?.length || 1}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              <KeyRound className="w-3.5 h-3.5 mr-1" /> API Key
            </Button>
          </div>
        </div>

        {/* Dynamic Key Input Modal / Dropdown */}
        {showApiKeyInput && (
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl animate-in slide-in-from-top-2 duration-300">
            <form onSubmit={handleSaveApiKey} className="flex flex-col sm:flex-row gap-3">
              <input
                type="password"
                placeholder="Enter Gemini API Key (AIzaSy...)"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                className="flex-1 h-10 px-4 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100"
              />
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl">
                Save Key
              </Button>
            </form>
          </div>
        )}

        {/* Visual Roadmap / Node Chain */}
        <div className="w-full bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800/60 overflow-x-auto backdrop-blur-sm">
          <div className="flex items-center justify-between min-w-[500px] gap-2 px-2">
            {state.prerequisites?.map((prereq: string, idx: number) => {
              const isCurrent = idx === state.current_index;
              const isMastered = state.mastery?.[prereq] === "verified";
              const isSkipped = state.mastery?.[prereq] === "skipped";
              const isLocked = idx > (state.current_index || 0);

              return (
                <div key={idx} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center text-center group cursor-default">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      isCurrent
                        ? "bg-blue-600 text-white ring-4 ring-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.6)]"
                        : isMastered
                        ? "bg-emerald-600 text-white"
                        : isSkipped
                        ? "bg-zinc-700 text-zinc-300"
                        : "bg-zinc-800 text-zinc-500"
                    }`}>
                      {isMastered ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isSkipped ? (
                        <FastForward className="w-4 h-4 text-zinc-300" />
                      ) : isLocked ? (
                        <Lock className="w-3.5 h-3.5 text-zinc-500" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span className={`text-[11px] font-medium mt-1.5 max-w-[100px] truncate ${
                      isCurrent ? "text-blue-300 font-semibold" : "text-zinc-500"
                    }`}>
                      {prereq}
                    </span>
                  </div>
                  
                  {idx < (state.prerequisites?.length || 1) - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 transition-all ${
                      idx < (state.current_index || 0) ? "bg-emerald-500/60" : "bg-zinc-800"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        {loading ? (
          renderSkeleton()
        ) : (
          <div className="space-y-6">
            {/* Concept Explanation Card */}
            <Card className="bg-zinc-900/80 border-zinc-800 shadow-2xl backdrop-blur-xl">
              <CardHeader className="pb-3 border-b border-zinc-800/50">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-widest mb-1">
                  <BookOpen className="w-4 h-4" /> Prerequisite Step {(state.current_index || 0) + 1}
                </div>
                <CardTitle className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {currentConcept}
                </CardTitle>
              </CardHeader>
              
              <CardContent className="pt-6 space-y-6">
                <div>
                  <FormattedContent content={state.current_explanation || ""} />
                </div>
                
                {state.current_example && (
                  <div className="p-5 bg-zinc-950/70 rounded-2xl border border-zinc-800 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500" />
                    <h4 className="text-xs font-bold text-blue-400 mb-3 uppercase tracking-wider">
                      Practical Example
                    </h4>
                    <FormattedContent content={state.current_example} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Knowledge Check / Assessment Card */}
            <Card className="bg-zinc-900/70 border-zinc-800/90 shadow-xl backdrop-blur-xl">
              <CardHeader className="border-b border-zinc-800/60 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg md:text-xl font-bold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-400" /> Knowledge Check
                  </CardTitle>
                  <span className="text-xs text-zinc-500 font-medium">3 Questions</span>
                </div>
              </CardHeader>
              
              {!isResultView ? (
                // Active Quiz View
                <>
                  <CardContent className="space-y-6 pt-6">
                    {state.current_quiz?.questions.map((q: any, qIdx: number) => (
                      <div key={qIdx} className="space-y-3 bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50">
                        <div className="font-semibold text-zinc-100 text-base flex gap-2">
                          <span className="text-blue-400">{qIdx + 1}.</span>
                          <FormattedContent content={q.question} className="text-zinc-100 font-medium" />
                        </div>
                        
                        <RadioGroup 
                          value={selectedAnswers[qIdx] !== undefined ? selectedAnswers[qIdx].toString() : undefined}
                          onValueChange={(val) => {
                            const newAnswers = [...selectedAnswers];
                            newAnswers[qIdx] = parseInt(val, 10);
                            setSelectedAnswers(newAnswers);
                          }}
                          className="space-y-2 pt-1"
                        >
                          {q.options.map((opt: string, optIdx: number) => (
                            <div 
                              key={optIdx} 
                              className={`flex items-start space-x-3 p-3 rounded-xl border transition-all cursor-pointer ${
                                selectedAnswers[qIdx] === optIdx 
                                  ? "bg-blue-600/15 border-blue-500/60 text-blue-100" 
                                  : "bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-800/50 text-zinc-300"
                              }`}
                              onClick={() => {
                                const newAnswers = [...selectedAnswers];
                                newAnswers[qIdx] = optIdx;
                                setSelectedAnswers(newAnswers);
                              }}
                            >
                              <RadioGroupItem 
                                value={optIdx.toString()} 
                                id={`q${qIdx}-o${optIdx}`} 
                                className="mt-0.5 border-zinc-600 text-blue-500" 
                              />
                              <Label 
                                htmlFor={`q${qIdx}-o${optIdx}`} 
                                className="flex-1 cursor-pointer text-sm font-normal leading-relaxed"
                              >
                                <FormattedContent content={opt} className="text-sm" />
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    ))}
                  </CardContent>

                  <CardFooter className="flex flex-col sm:flex-row gap-4 justify-between border-t border-zinc-800/80 pt-6">
                    <Button 
                      variant="ghost" 
                      onClick={handleSkip} 
                      className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 text-sm font-medium flex items-center gap-1.5"
                    >
                      <FastForward className="w-4 h-4" /> I already know this — Skip
                    </Button>
                    <Button 
                      onClick={handleSubmitQuiz} 
                      className="bg-blue-600 hover:bg-blue-500 text-white px-8 h-12 rounded-full font-semibold shadow-[0_0_25px_-5px_rgba(37,99,235,0.4)] hover:shadow-[0_0_35px_-5px_rgba(37,99,235,0.6)] transition-all disabled:opacity-40 disabled:shadow-none"
                      disabled={selectedAnswers.length !== state.current_quiz?.questions.length || selectedAnswers.includes(undefined as any)}
                    >
                      Submit Quiz
                    </Button>
                  </CardFooter>
                </>
              ) : (
                // Quiz Evaluation Results
                <CardContent className="py-10 text-center space-y-6">
                  {passed ? (
                    <div className="space-y-4 animate-in zoom-in-95 duration-500">
                       <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
                         <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                       </div>
                       <h3 className="text-2xl font-bold text-emerald-400">Concept Verified!</h3>
                       <p className="text-zinc-300 max-w-md mx-auto text-sm md:text-base">
                         Great work! You scored {Math.round((state.quiz_score || 0) * 100)}% and demonstrated mastery of <strong className="text-white">{currentConcept}</strong>.
                       </p>
                       <Button 
                         onClick={handleNextConcept} 
                         className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white px-8 h-12 rounded-full font-semibold shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)] transition-all"
                       >
                          Proceed to Next Concept <ChevronRight className="w-4 h-4 ml-1" />
                       </Button>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in zoom-in-95 duration-500">
                       <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto">
                         <HelpCircle className="w-8 h-8 text-amber-400" />
                       </div>
                       <h3 className="text-2xl font-bold text-amber-400">Needs More Practice</h3>
                       <p className="text-zinc-300 max-w-md mx-auto text-sm md:text-base">
                         You scored {Math.round((state.quiz_score || 0) * 100)}%. Review the explanation and code example above before trying again.
                       </p>
                       <div className="flex justify-center gap-4 pt-2">
                         <Button 
                           onClick={() => callOrchestrator({ ...state, quiz_score: null, quiz_answers: [] }, "none")} 
                           className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 h-11 rounded-full font-medium"
                         >
                            <RotateCcw className="w-4 h-4 mr-2" /> Try Again
                         </Button>
                         <Button 
                           variant="outline"
                           onClick={handleSkip} 
                           className="border-zinc-700 text-zinc-400 hover:text-white px-6 h-11 rounded-full font-medium"
                         >
                            Skip Anyway
                         </Button>
                       </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

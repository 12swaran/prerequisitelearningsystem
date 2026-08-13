"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export default function Home() {
  const [topic, setTopic] = useState("");
  const router = useRouter();

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    
    // Save the target concept to localStorage to be picked up by the learn page
    localStorage.setItem("pathfinder_target", topic.trim());
    // Clear any previous state
    localStorage.removeItem("pathfinder_state");
    
    router.push("/learn");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-zinc-950 text-zinc-50 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="z-10 w-full max-w-2xl text-center space-y-8">
        <div className="space-y-4 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-zinc-900/50 border border-zinc-800 rounded-2xl mb-4 backdrop-blur-sm">
            <Sparkles className="w-6 h-6 text-blue-400" />
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
            Pathfinder
          </h1>
          <p className="text-lg md:text-xl text-zinc-400 max-w-xl mx-auto">
            Master any subject through a personalized, prerequisite-aware learning journey.
          </p>
        </div>

        <form onSubmit={handleStart} className="flex flex-col sm:flex-row items-center gap-4 max-w-xl mx-auto mt-12">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="What do you want to learn? (e.g. React Server Components)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full h-14 pl-6 pr-4 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-lg shadow-inner"
            />
          </div>
          <Button 
            type="submit" 
            disabled={!topic.trim()}
            className="h-14 px-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-lg font-medium shadow-[0_0_40px_-10px_rgba(37,99,235,0.5)] hover:shadow-[0_0_60px_-15px_rgba(37,99,235,0.7)] transition-all duration-300 disabled:opacity-50 disabled:shadow-none"
          >
            Start Journey
          </Button>
        </form>
      </div>
    </main>
  );
}

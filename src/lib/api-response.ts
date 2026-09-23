import type { PathfinderState } from "./langgraph";

export async function readApiResponse(res: Response): Promise<PathfinderState> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    if ([502, 503, 504].includes(res.status)) {
      throw new Error(`The server could not complete the request (HTTP ${res.status}). Please retry.`);
    }
    throw new Error(`The learning API returned a page instead of data (HTTP ${res.status}). Please retry or check the server deployment.`);
  }

  let data: { state?: PathfinderState; error?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error(`The learning API returned an invalid response (HTTP ${res.status}). Please retry.`);
  }
  if (!data || typeof data !== "object") {
    throw new Error("The learning API returned an invalid response. Please retry.");
  }
  if (!res.ok) throw new Error(data.error || `The learning API failed (HTTP ${res.status}).`);
  if (data.state?.error) throw new Error(data.state.error);
  if (!data.state) throw new Error("The learning API returned no learning state. Please retry.");
  return data.state;
}

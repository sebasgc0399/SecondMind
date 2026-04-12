/**
 * Strips markdown JSON fences from Claude responses.
 * Claude Haiku sometimes wraps JSON in ```json ... ``` despite prompt instructions.
 */
export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch && fenceMatch[1]) return fenceMatch[1].trim();
  return trimmed;
}

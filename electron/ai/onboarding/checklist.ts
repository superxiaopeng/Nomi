/**
 * Standard field checklist per model kind.
 *
 * Used by `check_completeness` tool: the agent must respond
 * "has / no / unsure" for each item. "unsure" triggers re-scan.
 *
 * Goal: stop the agent from "I didn't see X in the doc, so it doesn't exist"
 * mistakes. Forces explicit reasoning about every common field.
 *
 * Each item has a `commonAliases` list  -  the agent must consider that
 * doc authors use different names for the same concept.
 */
import type { ModelKind } from "./types";

export type ChecklistItem = {
  field: string;
  description: string;
  commonAliases: string[];
  importance: "core" | "common" | "optional";
};

export const CHECKLISTS: Record<ModelKind, ChecklistItem[]> = {
  text: [
    { field: "prompt", description: "User message or input text", commonAliases: ["messages", "input", "text"], importance: "core" },
    { field: "system_prompt", description: "System / instruction prompt", commonAliases: ["system", "instructions"], importance: "common" },
    { field: "temperature", description: "Randomness control", commonAliases: ["temp"], importance: "common" },
    { field: "max_tokens", description: "Output length limit", commonAliases: ["max_completion_tokens", "max_output_tokens"], importance: "common" },
    { field: "model", description: "Model identifier", commonAliases: ["model_id", "model_name"], importance: "core" },
    { field: "stream", description: "Stream response", commonAliases: [], importance: "optional" },
  ],

  image: [
    { field: "prompt", description: "Text describing the image", commonAliases: ["text"], importance: "core" },
    { field: "negative_prompt", description: "What to avoid in the image", commonAliases: ["negative"], importance: "common" },
    { field: "size", description: "Image dimensions", commonAliases: ["dimensions", "width_height", "resolution"], importance: "core" },
    { field: "aspect_ratio", description: "Aspect ratio shortcut", commonAliases: ["ratio"], importance: "common" },
    { field: "n", description: "Number of images to generate", commonAliases: ["count", "batch_size"], importance: "common" },
    { field: "seed", description: "Random seed for reproducibility", commonAliases: [], importance: "common" },
    { field: "cfg_scale", description: "Prompt adherence", commonAliases: ["guidance_scale", "cfg"], importance: "common" },
    { field: "image_url", description: "Input image for img2img / edits", commonAliases: ["image", "init_image", "reference_image"], importance: "common" },
    { field: "strength", description: "Img2img strength", commonAliases: ["denoising_strength", "image_strength"], importance: "optional" },
    { field: "style", description: "Style preset", commonAliases: ["style_preset"], importance: "optional" },
  ],

  video: [
    { field: "prompt", description: "Text describing the video", commonAliases: ["text"], importance: "core" },
    { field: "negative_prompt", description: "What to avoid", commonAliases: ["negative"], importance: "common" },
    { field: "duration", description: "Video length in seconds", commonAliases: ["duration_seconds", "length", "seconds"], importance: "core" },
    { field: "size", description: "Video dimensions", commonAliases: ["resolution", "dimensions"], importance: "core" },
    { field: "aspect_ratio", description: "Aspect ratio shortcut", commonAliases: ["ratio"], importance: "common" },
    { field: "image_url", description: "Reference image for image-to-video", commonAliases: ["image", "init_image", "reference_image"], importance: "common" },
    { field: "first_frame_url", description: "First frame for keyframe-to-video", commonAliases: ["start_frame", "first_image"], importance: "common" },
    { field: "last_frame_url", description: "Last frame for keyframe-to-video", commonAliases: ["end_frame", "last_image", "tail_image"], importance: "common" },
    { field: "seed", description: "Random seed", commonAliases: [], importance: "common" },
    { field: "cfg_scale", description: "Prompt adherence", commonAliases: ["guidance_scale"], importance: "optional" },
    { field: "enable_audio", description: "Generate with audio track", commonAliases: ["audio", "with_audio", "sound"], importance: "common" },
    { field: "fps", description: "Frames per second", commonAliases: ["framerate"], importance: "optional" },
    { field: "model_version", description: "Sub-model version (std/pro/fast)", commonAliases: ["mode", "tier", "variant", "quality"], importance: "common" },
  ],

  audio: [
    { field: "prompt", description: "Text describing the audio / lyrics", commonAliases: ["text", "lyrics"], importance: "core" },
    { field: "voice", description: "Voice / speaker identity", commonAliases: ["speaker", "voice_id"], importance: "common" },
    { field: "duration", description: "Audio length", commonAliases: ["length", "seconds"], importance: "common" },
    { field: "language", description: "Output language", commonAliases: ["lang"], importance: "common" },
    { field: "format", description: "Output format (mp3/wav)", commonAliases: ["output_format", "encoding"], importance: "optional" },
    { field: "sample_rate", description: "Sample rate", commonAliases: [], importance: "optional" },
    { field: "speed", description: "Playback speed", commonAliases: ["rate"], importance: "optional" },
    { field: "model", description: "Audio model identifier", commonAliases: ["model_id"], importance: "core" },
  ],
};

export function getChecklist(kind: ModelKind): ChecklistItem[] {
  return CHECKLISTS[kind] || [];
}

/**
 * Format checklist for inclusion in agent system prompt.
 */
export function formatChecklistForPrompt(kind: ModelKind): string {
  const items = getChecklist(kind);
  const lines = items.map((item) => {
    const aliases = item.commonAliases.length > 0 ? ` (also: ${item.commonAliases.join(", ")})` : "";
    const tag = item.importance === "core" ? "[CORE]" : item.importance === "common" ? "[COMMON]" : "[OPT]";
    return `  ${tag} ${item.field}${aliases}  -  ${item.description}`;
  });
  return `Standard ${kind} model fields:\n${lines.join("\n")}`;
}

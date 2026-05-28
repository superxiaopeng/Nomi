/**
 * The onboarding agent loop.
 *
 * Single entry point: run one trial. Returns the structured outcome
 * suitable for serialization to disk (trace.json).
 *
 * Used by:
 *  - scripts/lab-onboard.ts (CLI)
 *  - electron/main.ts IPC handler (Phase B — user-facing)
 */
import { generateText } from "ai";
import { buildAiSdkModel } from "../buildAiSdkModel";
import { buildOnboardingTools } from "./tools";
import { buildSystemPrompt } from "./systemPrompt";
import { draftStore } from "./draft";
import type { ModelKind, ProviderKind, TrialEvent, TrialOutcome } from "./types";

export type OnboardingAgentInput = {
  trialId: string;
  docsUrl: string;
  targetKind: ModelKind;
  /** Real API key used to test the target model. Never enters LLM context. */
  userApiKey: string;
  /** Agent LLM credentials. */
  agent: {
    providerKind: ProviderKind;
    baseUrl: string;
    modelId: string;
    apiKey: string;
  };
  /** Max LLM steps. Default 10. */
  maxSteps?: number;
  /** Event sink for trace reporter. */
  onEvent?: (e: TrialEvent) => void;
};

export async function runOnboardingTrial(input: OnboardingAgentInput): Promise<TrialOutcome> {
  const startedAt = Date.now();
  const sessionId = input.trialId;
  const draft = draftStore.create(sessionId, input.targetKind);

  input.onEvent?.({
    type: "trial-start",
    trialId: input.trialId,
    docsUrl: input.docsUrl,
    targetKind: input.targetKind,
    agentModel: input.agent.modelId,
  });

  let toolCalls = 0;

  const tools = buildOnboardingTools({
    sessionId,
    resolveUserApiKey: () => input.userApiKey,
    onToolCall: (event) => {
      toolCalls += 1;
      input.onEvent?.({
        type: "tool-call",
        toolName: event.tool,
        args: event.args,
        toolCallId: `call-${toolCalls}`,
      });
      input.onEvent?.({
        type: "tool-result",
        toolName: event.tool,
        result: event.result,
        toolCallId: `call-${toolCalls}`,
      });
    },
    allowedDomain: () => draftStore.get(sessionId).vendorBaseUrl,
  });

  const model = buildAiSdkModel({
    kind: input.agent.providerKind,
    baseURL: input.agent.baseUrl,
    apiKey: input.agent.apiKey,
    modelId: input.agent.modelId,
  });

  let llmError: Error | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let stepCount = 0;

  try {
    // Some reasoning models (o1, o3, kimi-k2.x) only accept temperature: 1.
    const restrictedTempModels = /^(o1|o3|kimi-k2)/i;
    const temperature = restrictedTempModels.test(input.agent.modelId) ? 1 : 0.1;

    const result = await generateText({
      model,
      system: buildSystemPrompt(input.targetKind, input.docsUrl),
      messages: [{
        role: "user",
        content: `Please onboard this model. Docs URL: ${input.docsUrl}. Target kind: ${input.targetKind}. Follow the workflow.`,
      }],
      tools,
      maxSteps: input.maxSteps ?? 10,
      temperature,
      // Moonshot defaults max_tokens too low (causes truncated tool-call JSON). Force higher.
      maxTokens: 4096,
      onStepFinish: (step) => {
        stepCount += 1;
        input.onEvent?.({
          type: "llm-step",
          stepIndex: stepCount,
          ...(step.text ? { text: step.text.slice(0, 1000) } : {}),
        });
      },
    });
    promptTokens = result.usage?.promptTokens || 0;
    completionTokens = result.usage?.completionTokens || 0;
    totalTokens = result.usage?.totalTokens || 0;
  } catch (e) {
    llmError = e instanceof Error ? e : new Error(String(e));
  }

  const finishedAt = Date.now();
  const finalDraft = draftStore.get(sessionId);

  // Determine final status from draft state, not just LLM result
  const lastTest = finalDraft.testAttempts[finalDraft.testAttempts.length - 1];
  const hasCommitableDraft = !draftStore.validateForCommit(sessionId);

  let status: TrialOutcome["status"];
  let failureReason: string | undefined;
  if (llmError) {
    status = "failure";
    failureReason = `LLM error: ${llmError.message}`;
  } else if (hasCommitableDraft && lastTest?.ok) {
    status = "success";
  } else if (lastTest?.ok) {
    status = "partial";
    failureReason = "Test passed but draft incomplete (missing required catalog fields)";
  } else if (finalDraft.modelFields.length > 0) {
    status = "partial";
    failureReason = lastTest ? `Last test failed: ${lastTest.diagnostics.join("; ")}` : "No successful test attempt";
  } else {
    status = "failure";
    failureReason = "Agent gave up before extracting any fields";
  }

  const outcome: TrialOutcome = {
    trialId: input.trialId,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    docsUrl: input.docsUrl,
    targetKind: input.targetKind,
    agentModel: input.agent.modelId,
    status,
    ...(failureReason ? { failureReason } : {}),
    rounds: stepCount,
    toolCalls,
    tokenUsage: { promptTokens, completionTokens, totalTokens },
    draft: finalDraft,
  };

  input.onEvent?.({ type: "trial-end", outcome });

  // cleanup
  draftStore.delete(sessionId);

  return outcome;
}

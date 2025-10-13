export default class CassetteLLM {
  constructor(options?: {
    mode?: "live" | "record" | "replay" | "auto";
    cassetteDir?: string;
    modelOptions?: any;
    logger?: any;
    verbose?: boolean;
    redact?: (cassette: any) => any;
    onReplayMiss?: "error" | "live" | "mock" | ((ctx: any) => Promise<any>);
  });
  invoke(messages: any[], callOptions?: any): Promise<any>;
  bindTools(tools: any[]): Promise<this>;
}

export function createTokenLogger(): {
  onCall: (ev: any) => void;
  summary: () => {
    total: {
      calls: number;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cost_usd: number;
      saved_usd: number;
      saved_tokens: number;
    };
    calls: any[];
  };
};

export function extractAssistantText(msg: any): string;

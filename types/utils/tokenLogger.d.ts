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

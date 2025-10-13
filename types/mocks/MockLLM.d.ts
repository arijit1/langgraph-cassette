export class MockLLM {
  constructor(options?: { behavior?: "echo" | "template"; template?: string });
  bindTools(tools: any[]): Promise<this>;
  invoke(messages: any[], callOptions?: any): Promise<any>;
}
export default MockLLM;
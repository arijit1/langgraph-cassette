// src/mocks/MockLLM.js

export class MockLLM {
  constructor(opts = {}) {
    this._tools = [];
    this.behavior = opts.behavior || "echo"; // "echo" | "template"
    this.template = opts.template || "Mock response: {{lastUser}}";
  }
  setTools(tools) { this._tools = tools || []; }
  async bindTools(tools) { this.setTools(tools); return this; }

  async invoke(messages) {
    const lastUser = [...(messages || [])].reverse().find(m => m.role === "user")?.content || "";
    let content = "";
    if (this.behavior === "template") {
      content = this.template.replace("{{lastUser}}", String(lastUser));
    } else {
      content = `Echo: ${String(lastUser).slice(0, 200)}`;
    }

    // naive tool-call synthesis
    const tc = [];
    if (this._tools?.length && typeof lastUser === "string") {
      const match = this._tools.find(t => lastUser.toLowerCase().includes(String(t.name).toLowerCase()));
      if (match) {
        tc.push({
          id: `tool_${Date.now()}`,
          type: "function",
          function: { name: match.name, arguments: JSON.stringify({ mock: true }) }
        });
      }
    }

    return {
      role: "assistant",
      content: tc.length ? "" : content,
      tool_calls: tc,
      response_metadata: { tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
    };
  }
}

export default MockLLM;

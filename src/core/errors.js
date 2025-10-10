export class CassetteReplayMissError extends Error {
  constructor({ key, cassettePath, cassetteDir, mode, hint }) {
    const msg =
`LangGraph Cassette: replay file not found.

  mode          : ${mode}
  key           : ${key}
  expected file : ${cassettePath}
  cassette dir  : ${cassetteDir}

${hint || "Tip: Record it first with CASSETTE_MODE=record, then replay."}
`;
    super(msg);
    this.name = "CassetteReplayMissError";
    this.key = key;
    this.cassettePath = cassettePath;
    this.cassetteDir = cassetteDir;
    this.mode = mode;
  }
}

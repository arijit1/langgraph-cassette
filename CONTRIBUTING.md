# 🤝 Contributing to LangGraph Cassette

Thank you for your interest in contributing to **LangGraph Cassette**!  
This project is open-source and community-driven — contributions, feedback, and improvements are all welcome.

---

## 🧰 Getting Started

### 1. Fork & Clone

```bash
git clone https://github.com/arijit1/langgraph-cassette.git
cd langgraph-cassette
npm install
```

> 💡 Requires **Node.js v18+** (ESM support enabled).

---

### 2. Project Layout

```
src/
  core/          → Core orchestrator (CassetteLLM, modes, errors)
  utils/         → Helpers (token logger, cassette storage)
  mocks/         → Offline mock LLM
  cli/           → Command-line interface
examples/        → LangGraph & LangChain demos
```

---

## 🧩 Development Workflow

1. Create a feature branch:

   ```bash
   git checkout -b feat/<feature-name>
   ```
2. Implement your feature or fix.
3. Test using the example scripts.
4. Push your branch:

   ```bash
   git push origin feat/<feature-name>
   ```
5. Open a Pull Request to `main`.

---

## 🧹 Code Guidelines

* ✅ 100% **JavaScript (ESM)** — no TypeScript (for now).
* ✅ Keep dependencies **minimal** (prefer Node stdlib).
* ✅ Comment your code where logic isn’t obvious.
* ✅ Match the existing file structure and naming convention.
* ✅ Avoid network calls in replay or mock modes.

---

## 🧭 Commit Message Format

Use concise, conventional commits:

| Type        | Description             | Example                                       |
| ----------- | ----------------------- | --------------------------------------------- |
| `feat:`     | New feature             | `feat: add auto replay mode`                  |
| `fix:`      | Bug fix                 | `fix: handle missing cassette directory`      |
| `docs:`     | Documentation           | `docs: update README with setup steps`        |
| `refactor:` | Non-functional refactor | `refactor: split replay logic into mode file` |
| `test:`     | Add or update tests     | `test: add cassette load test`                |

---

## 🧪 Testing Your Changes

The easiest way to test is by running the included examples for langgraph or langchain:

```bash
# Record a new run
CASSETTE_MODE=record node examples/langchain.mjs

# Replay offline
CASSETTE_MODE=replay node examples/langchain.mjs
```

Verify that:

* A cassette JSON file is written to `.cassettes/`
* Replay works without calling the network
---

## 🧾 Pull Request Checklist

Before submitting:

* [ ] Code builds and runs locally
* [ ] Example scripts (`langchain.mjs`, `langgraph.mjs`) succeed
* [ ] New code is commented and formatted cleanly
* [ ] Docs are updated if you changed user-facing behavior (if any)
* [ ] Commit messages follow convention

---

## 🧭 Reporting Bugs

When opening an issue, please include:

* Node.js version
* LangGraph Cassette version
* Mode (`record`, `replay`, `auto`, or `live`)
* Reproduction steps
* Example error log or console output

Example:

```
CASSETTE_MODE=replay node examples/langchain.mjs
Error: Cassette not found for key 03ee6...
```

---

## 🏁 Releasing (Maintainers Only)

1. Bump version in `package.json`
2. Update `CHANGELOG.md`
3. Verify examples in record/replay mode
4. Publish:

   ```bash
   npm publish --access public
   ```

---

## 💬 Need Help?

Open a [GitHub Issue](https://github.com/arijit1/langgraph-cassette/issues)
or start a discussion to share feedback or new ideas.

---

Made with ❤️ for the LangGraph & LangChain developer community. Exploring More Possibilities. Please Support...!

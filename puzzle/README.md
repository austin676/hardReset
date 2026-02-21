# Puzzle.Game Module

A standalone Node.js + Express service that generates coding puzzles using an LLM (Claude/OpenAI) and validates player submissions via the Judge0 API.

## Directory Structure

```
puzzle/
├── src/
│   ├── server.ts                    # Express app entry point
│   ├── types/
│   │   └── puzzle.ts                # TypeScript interfaces
│   ├── prompts/
│   │   └── domainPrompts.ts         # Domain-specific LLM prompt templates + fallback puzzles
│   ├── cache/
│   │   └── sessionCache.ts          # In-memory per-session puzzle cache (30-min TTL)
│   ├── services/
│   │   ├── llmService.ts            # Claude / OpenAI puzzle generation
│   │   └── judge0Service.ts         # Judge0 code execution + polling
│   └── controllers/
│       └── puzzleController.ts      # Express route handlers
├── .env.example
├── package.json
└── tsconfig.json
```

## Getting Started

### 1. Install dependencies

```bash
cd puzzle
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in your API keys
```

### 3. Run in development mode

```bash
npm run dev
```

The service starts on `http://localhost:4000` (or the `PORT` env variable).

### 4. Build for production

```bash
npm run build
npm start
```

---

## API Endpoints

### `POST /puzzle/generate`

Generates a coding puzzle for a given programming domain.

**Request**
```json
{
  "domain": "python-oops"
}
```

Supported domains: `python-oops`, `python-dsa`, `frontend-js`

**Response**
```json
{
  "prompt": "Create a class `BankAccount` with deposit, withdraw, and get_balance methods...",
  "starterCode": "class BankAccount:\n    def __init__(self, owner: str):\n        # TODO: ...",
  "testInput": "",
  "expectedOutput": "300.0",
  "languageId": 71
}
```

**Session caching:** Pass `x-session-id` header to reuse a cached puzzle for the same session. The response echoes the `x-session-id` header.

---

### `POST /puzzle/submit`

Submits a player's solution for execution and validation.

**Request**
```json
{
  "sourceCode": "class BankAccount:\n    def __init__(self, owner):\n        self.owner = owner\n        self.balance = 0.0\n    def deposit(self, amount):\n        self.balance += amount\n    def withdraw(self, amount):\n        if amount > self.balance:\n            raise ValueError('Insufficient funds')\n        self.balance -= amount\n    def get_balance(self):\n        return self.balance\n\nacc = BankAccount('Alice')\nacc.deposit(500)\nacc.withdraw(200)\nprint(acc.get_balance())",
  "testInput": "",
  "expectedOutput": "300.0",
  "languageId": 71
}
```

**Response – passed**
```json
{
  "status": "passed",
  "output": "300.0"
}
```

**Response – failed**
```json
{
  "status": "failed",
  "output": "0.0"
}
```

---

## Judge0 Language IDs

| Language          | ID |
|-------------------|----|
| Python 3          | 71 |
| JavaScript (Node) | 63 |
| Java              | 62 |
| C++ (GCC)         | 54 |

Full list: https://judge0-ce.p.rapidapi.com/languages

---

## Socket.io Integration (TODO)

The controller file (`puzzleController.ts`) and server (`server.ts`) contain `TODO` comments marking the integration points for the Socket.io game server:

- `server.ts` – attach `socket.io` to the HTTP server and listen for `puzzle:request` / `puzzle:submit` events
- `puzzleController.ts` – after generating or validating a puzzle, emit results to the relevant game room

Example sketch:

```ts
import { createServer } from "http";
import { Server } from "socket.io";
import app from "./server.js";
import { generatePuzzle } from "./services/llmService.js";
import { runCode } from "./services/judge0Service.js";

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("puzzle:request", async ({ domain, roomId }) => {
    const puzzle = await generatePuzzle(domain);
    io.to(roomId).emit("puzzle:ready", puzzle);
  });

  socket.on("puzzle:submit", async ({ sourceCode, testInput, expectedOutput, languageId, roomId }) => {
    const result = await runCode({ source_code: sourceCode, language_id: languageId, stdin: testInput });
    const passed = (result.stdout ?? "").trim() === expectedOutput.trim();
    io.to(roomId).emit("puzzle:result", { status: passed ? "passed" : "failed", output: result.stdout });
  });
});
```

# task-engine

Lightweight Express service that evaluates user-submitted code against predefined tasks using the **Wandbox** public API (no API key required).

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Create a .env if you want to change the port
cp .env.example .env

# 3. Run the server
npm run dev      # with hot-reload (nodemon)
# or
npm start        # plain node
```

The server starts on **<http://localhost:4000>** by default.

## API Endpoints

### `GET /health`

Health-check → `{ "status": "ok" }`

### `GET /debug/piston`

Verifies Wandbox connectivity by running `print(2+3)` in Python → `{ "ok": true, "stdout": "5" }`

### `GET /api/tasks`

Returns all available tasks (without `expectedOutput`).

### `POST /api/tasks/submit`

Submit a solution for evaluation.

**Request body:**

```json
{
  "taskId": "python_oops_1",
  "language": "python",
  "userCode": "class Dog:\n    def __init__(self, name):\n        self.name = name\n\n    def speak(self):\n        return f\"Woof! My name is {self.name}\"\n\ndog = Dog(\"Buddy\")\nprint(dog.speak())"
}
```

**Response:**

```json
{
  "passed": true,
  "stdout": "Woof! My name is Buddy",
  "stderr": null,
  "time": null,
  "memory": null
}
```

### Example curl

```bash
# 1. Health check
curl http://localhost:4000/health

# 2. Verify code execution engine
curl http://localhost:4000/debug/piston

# 3. Submit a solution
curl -X POST http://localhost:4000/api/tasks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "python_oops_1",
    "language": "python",
    "userCode": "class Dog:\n    def __init__(self, name):\n        self.name = name\n    def speak(self):\n        return f\"Woof! My name is {self.name}\"\ndog = Dog(\"Buddy\")\nprint(dog.speak())"
  }'
```

## Integration with Phaser / Socket Layer

1. **Fetch available tasks** via `GET /api/tasks` when a puzzle round starts.
2. **Display the prompt + starterCode** in an in-game code editor (e.g. Monaco Editor iframe).
3. **POST the player's code** to `/api/tasks/submit` with `{ taskId, language, userCode }`.
4. Use the `passed` boolean to update game state (score, progress, sabotage triggers).
5. Optionally show `stdout` / `stderr` to the player for debugging.

If integrating via Socket.IO, the socket handler can `fetch` this endpoint server-side and emit the result back.

## Environment Variables

| Variable       | Description                          | Default |
| -------------- | ------------------------------------ | ------- |
| `PORT`         | Server port                          | `4000`  |
| `GROQ_API_KEY` | *(Optional)* LLM key for puzzle gen  | —       |

> **Note:** Code execution uses the Wandbox public API — **no API key required**.

## Project Structure

```
src/
├── server.js            # Express entry point + /debug/piston route
├── routes/tasks.js      # /api/tasks routes
├── services/judge0.js   # Wandbox API wrapper
├── utils/validator.js   # Output comparison
└── data/tasks.json      # Seed tasks
```

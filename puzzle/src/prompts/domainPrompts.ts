import type { PuzzleData } from "../types/puzzle.js";

export interface DomainPromptTemplate {
  systemPrompt: string;
  userPrompt: string;
  languageId: number;
  fallbackPuzzle: PuzzleData;
}

const PYTHON_OOP_FALLBACK: PuzzleData = {
  prompt:
    "Create a class `BankAccount` with methods `deposit(amount)`, `withdraw(amount)`, and `get_balance()`. " +
    "The constructor takes an `owner` name and initializes balance to 0. " +
    "`withdraw` should raise a `ValueError` if funds are insufficient.",
  starterCode: `class BankAccount:
    def __init__(self, owner: str):
        # TODO: initialize owner and balance
        pass

    def deposit(self, amount: float) -> None:
        # TODO: add amount to balance
        pass

    def withdraw(self, amount: float) -> None:
        # TODO: subtract amount; raise ValueError if insufficient funds
        pass

    def get_balance(self) -> float:
        # TODO: return current balance
        pass

# Test
acc = BankAccount("Alice")
acc.deposit(500)
acc.withdraw(200)
print(acc.get_balance())
`,
  testInput: "",
  expectedOutput: "300.0",
  languageId: 71, // Python 3
  // Note: Python 3 always prints floats with a decimal point (e.g. 300.0), so output is deterministic.
};

const PYTHON_DSA_FALLBACK: PuzzleData = {
  prompt:
    "Implement a function `two_sum(nums: list[int], target: int) -> list[int]` that returns indices " +
    "of two numbers in `nums` that add up to `target`. Assume exactly one solution exists.",
  starterCode: `def two_sum(nums: list[int], target: int) -> list[int]:
    # TODO: return indices of the two numbers that sum to target
    pass

# Test
print(two_sum([2, 7, 11, 15], 9))
`,
  testInput: "",
  expectedOutput: "[0, 1]",
  languageId: 71, // Python 3
  // Note: Python 3 always formats lists with a space after commas, so output is deterministic.
};

const FRONTEND_JS_FALLBACK: PuzzleData = {
  prompt:
    "Write a function `flattenArray(arr)` that takes a nested array of any depth and returns a single flat array. " +
    "For example: flattenArray([1, [2, [3, [4]], 5]]) should return [1, 2, 3, 4, 5].",
  starterCode: `/**
 * @param {any[]} arr
 * @returns {any[]}
 */
function flattenArray(arr) {
  // TODO: implement recursive or iterative flattening
}

// Test
console.log(JSON.stringify(flattenArray([1, [2, [3, [4]], 5]])));
`,
  testInput: "",
  expectedOutput: "[1,2,3,4,5]",
  languageId: 63, // JavaScript (Node.js)
};

export const domainPrompts: Record<string, DomainPromptTemplate> = {
  "python-oops": {
    languageId: 71,
    fallbackPuzzle: PYTHON_OOP_FALLBACK,
    systemPrompt: `You are a coding puzzle generator for an educational game. Generate Python OOP puzzles.
Always respond with valid JSON matching this exact structure:
{
  "prompt": "description of the task",
  "starterCode": "Python starter code with TODO comments",
  "testInput": "stdin input for test (empty string if none)",
  "expectedOutput": "exact expected stdout output"
}`,
    userPrompt: `Generate a Python OOP coding puzzle involving classes, inheritance, or encapsulation.
The puzzle should be solvable in 5-10 minutes by an intermediate developer.
The starter code must include clear TODO markers.
The expected output must be a single deterministic line printed to stdout.`,
  },

  "python-dsa": {
    languageId: 71,
    fallbackPuzzle: PYTHON_DSA_FALLBACK,
    systemPrompt: `You are a coding puzzle generator for an educational game. Generate Python DSA puzzles.
Always respond with valid JSON matching this exact structure:
{
  "prompt": "description of the task",
  "starterCode": "Python starter code with TODO comments",
  "testInput": "stdin input for test (empty string if none)",
  "expectedOutput": "exact expected stdout output"
}`,
    userPrompt: `Generate a Python data structures and algorithms puzzle (e.g., arrays, hashmaps, stacks, trees, sorting).
The puzzle should be solvable in 5-10 minutes by an intermediate developer.
The starter code must include clear TODO markers.
The expected output must be a single deterministic line printed to stdout.`,
  },

  "frontend-js": {
    languageId: 63,
    fallbackPuzzle: FRONTEND_JS_FALLBACK,
    systemPrompt: `You are a coding puzzle generator for an educational game. Generate JavaScript/Node.js puzzles.
Always respond with valid JSON matching this exact structure:
{
  "prompt": "description of the task",
  "starterCode": "JavaScript starter code with TODO comments",
  "testInput": "stdin input for test (empty string if none)",
  "expectedOutput": "exact expected stdout output"
}`,
    userPrompt: `Generate a JavaScript coding puzzle involving DOM manipulation concepts, array methods, closures, or async patterns (adapted to run in Node.js via console.log).
The puzzle should be solvable in 5-10 minutes by an intermediate developer.
The starter code must include clear TODO markers.
The expected output must be a single deterministic line printed to stdout via console.log.`,
  },
};

export function getDomainTemplate(domain: string): DomainPromptTemplate {
  const template = domainPrompts[domain.toLowerCase()];
  if (!template) {
    // Default to python-dsa for unknown domains
    return domainPrompts["python-dsa"];
  }
  return template;
}

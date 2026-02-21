export interface PuzzleGenerateRequest {
  domain: string;
}

export interface PuzzleData {
  prompt: string;
  starterCode: string;
  testInput: string;
  expectedOutput: string;
  languageId: number;
}

export interface PuzzleSubmitRequest {
  sourceCode: string;
  testInput: string;
  expectedOutput: string;
  languageId: number;
}

export interface PuzzleSubmitResponse {
  status: "passed" | "failed";
  output: string;
}

export interface Judge0Submission {
  source_code: string;
  language_id: number;
  stdin: string;
}

export interface Judge0Result {
  token: string;
  stdout: string | null;
  stderr: string | null;
  status: {
    id: number;
    description: string;
  };
}

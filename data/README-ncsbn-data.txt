NCSBN QUESTION BANK DATA

Files:
- ncsbn-questions.json: JSON array of extracted question records.
- ncsbn-questions.js: ES module exporting the same array as the default export.

Fields:
- id: sequential app ID (1..884)
- sourceQuestionNumber: original source number where available
- question: question text
- options: object with A, B, C, D
- correctAnswer: correct option letter or null if not found
- correctAnswerText: matched option text when available
- explanation: source review/explanation where available

Example JS import:
import questions from './ncsbn-questions.js';

Example JSON import (bundlers such as Vite support this):
import questions from './ncsbn-questions.json';

Missing or incomplete source content is left blank/null rather than guessed.

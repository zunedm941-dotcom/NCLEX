NCLEX Exam Cram Web App Data

Files:
- nclex-exam-cram-questions.json: JSON array of 1,250 questions.
- nclex-exam-cram-questions.js: ES module exporting `nclexQuestions` as a named and default export.

Each question object contains:
- id, questionNumber
- chapter, chapterQuestionNumber
- question
- options: { A, B, C, D }
- correctAnswer (letter)
- correctAnswerText

Example ES module usage:
  import nclexQuestions from "./data/nclex-exam-cram-questions.js";

Example JSON usage (depending on your bundler):
  import nclexQuestions from "./data/nclex-exam-cram-questions.json";

Source fidelity:
- The data is based on the uploaded Excel workbook's "All Questions" sheet.
- Blank source fields are preserved as null rather than guessed.
- One record has a missing correct answer in the source workbook.

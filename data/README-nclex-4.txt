NCLEX 4 Web App Data

Files:
- nclex-4-questions.json: JSON array containing 977 question records.
- nclex-4-questions.js: ES module exporting `nclex4Questions` as named and default exports.

Question object fields:
- id, questionNumber
- question
- options: {"A": "...", "B": "...", "C": "...", "D": "..."}
- correctAnswer: one letter when a single answer was clearly identified, otherwise null
- correctAnswers: array of letters when multiple answers were clearly identified, otherwise []
- correctAnswerSourceText: original Correct Answer cell from the workbook, preserved as supplied
- explanation: explanation text from the workbook

Usage:
  import nclex4Questions from "./data/nclex-4-questions.js";

Source notes:
- Converted 977 rows from the `NCLEX Questions` sheet.
- Original answer text is preserved because some cells combine answer letters and explanation fragments.
- Missing or ambiguous answer keys are not guessed. Review `correctAnswerSourceText` for those entries.

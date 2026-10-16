HESI 1200 Question Bank — Web App Data

Question records: 1148
Files:
- hesi-1200-questions.json: JSON array of question records.
- hesi-1200-questions.js: JavaScript variable named hesi1200Questions (also CommonJS export).

Each record includes: id, sourceQuestionNumber, examSection, question, options (object keyed A-F as available), correctAnswer, explanation, sourcePage.
No “Your Response” field is included.

Example browser usage:
<script src="./data/hesi-1200-questions.js"></script>
<script>console.log(hesi1200Questions);</script>

Example JSON module usage:
import questions from "./data/hesi-1200-questions.json";

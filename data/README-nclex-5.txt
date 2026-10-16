NCLEX 5 Web App Data

Files:
- nclex-5-questions.json: JSON array containing 1786 records.
- nclex-5-questions.js: ES module exporting `nclex5Questions` as named and default exports.

Fields:
- id, questionNumber, test, sourceQuestionNumber
- question
- options: A through F (unused options are null)
- correctAnswer: parsed letter only when answer key clearly uses letters and has one answer
- correctAnswers: parsed letter array when answer key clearly uses letters and multiple answers
- correctAnswerNumbers: parsed numeric option numbers when the source key clearly uses 1-6 numbering
- correctAnswerSourceText: original answer key text preserved verbatim
- explanation, sourcePage

Usage:
  import nclex5Questions from "./data/nclex-5-questions.js";

Important:
- The Excel workbook contains automated extraction from a 2,393-page PDF.
- Some answer key entries may not have been confidently parsed as a simple list of options; original source answer text is retained.
- Review question boundaries and answer keys before using this data for exam scoring.

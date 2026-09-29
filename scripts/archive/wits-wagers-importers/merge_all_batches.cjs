const fs = require('fs');
const path = require('path');

const tsFilePath = path.join(__dirname, '..', 'packages', 'games', 'wits-wagers', 'server', 'question-bank.zh-CN.ts');
let tsContent = fs.readFileSync(tsFilePath, 'utf8');

const batches = ['batch_A.json', 'batch_B.json', 'batch_C.json', 'batch_D.json', 'batch_E.json'];
let allNewQuestions = [];

for (const batch of batches) {
  const jsonPath = path.join(__dirname, batch);
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    allNewQuestions = allNewQuestions.concat(data);
  } else {
    console.warn(`Warning: ${batch} not found.`);
  }
}

console.log(`Loaded ${allNewQuestions.length} new questions from batches.`);

// 格式化为 TS 对象字符串
const newQuestionsString = allNewQuestions.map(q => {
  return `  {
    id: ${JSON.stringify(q.id)},
    prompt: ${JSON.stringify(q.prompt)},
    unit: ${JSON.stringify(q.unit)},
    answer: ${q.answer},
    sourceUrl: ${JSON.stringify(q.sourceUrl)},
    sourceNote: ${JSON.stringify(q.sourceNote)},
    asOf: ${JSON.stringify(q.asOf)},
    explanation: ${JSON.stringify(q.explanation)},
    reviewed: ${q.reviewed}
  }`;
}).join(',\n');

// 注入到原数组末尾
if (tsContent.match(/\];\s*$/)) {
  tsContent = tsContent.replace(/\];\s*$/, ',\n' + newQuestionsString + '\n];\n');
  fs.writeFileSync(tsFilePath, tsContent, 'utf8');
  console.log('Successfully injected new questions into question-bank.zh-CN.ts');
} else {
  console.error('Could not find the end of the array in the TS file.');
}

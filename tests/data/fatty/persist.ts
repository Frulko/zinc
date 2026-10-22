import { getHighScores } from '../../../examples/fatty/src/services/scores';
const scores = getHighScores();
if (scores[0].score !== 55 || scores[0].user_name !== 'Guillaume') throw new Error('Top 5 did not survive a restart');
console.log('fatty persistence: ok');

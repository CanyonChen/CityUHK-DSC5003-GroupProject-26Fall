'use strict';
async function retryTransaction(action) {
  for (let attempt = 0; ; attempt++) {
    try { return await action(); }
    catch (error) {
      if (error.code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
}
module.exports = { retryTransaction };

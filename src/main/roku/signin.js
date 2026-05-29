const { keypress, sendText } = require('./ecp');

async function sendUsername(host, username) {
  await sendText(host, username);
  await keypress(host, 'Enter');
  for (let i = 0; i < 1; i++) await keypress(host, 'Down');
}

async function sendPassword(host, password) {
  await sendText(host, password);
  await keypress(host, 'Enter');
  for (let i = 0; i < 1; i++) await keypress(host, 'Down');
}

async function signIn(host, username, password) {
  await sendUsername(host, username);
  await sendPassword(host, password);
}

module.exports = { signIn, sendUsername, sendPassword };

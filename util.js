const { promisify } = require("util");
const fs = require("fs");
const readline = require("readline");

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

function ensureFileSync(path, defaultContents) {
  if (!fs.existsSync(path)) {
    fs.writeFileSync(path, defaultContents);
  }
}

function prompt(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    console.clear();

    rl.question(prompt, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function run(main) {
  main(process.argv.slice(2)).then(null, console.error);
}

module.exports = { run, readFile, writeFile, ensureFileSync, prompt, sleep };

const Twitter = require("twitter");
const { promisify } = require("util");
const path = require("path");
const { ensureFileSync } = require("./util");

const {
  TWD_CONSUMER_KEY,
  TWD_CONSUMER_SECRET,
  TWD_ACCESS_TOKEN,
  TWD_ACCESS_TOKEN_SECRET,
  TWD_CACHE_FILE = path.resolve("./cache.json"),
  TWD_WHITELIST_FILE = path.resolve("./whitelist.json")
} = process.env;

if (
  !TWD_CONSUMER_KEY ||
  !TWD_CONSUMER_SECRET ||
  !TWD_ACCESS_TOKEN ||
  !TWD_ACCESS_TOKEN_SECRET
) {
  throw new Error("Invalid config");
}

ensureFileSync(TWD_CACHE_FILE, "[]");
ensureFileSync(TWD_WHITELIST_FILE, "[]");

const client = new Twitter({
  consumer_key: TWD_CONSUMER_KEY,
  consumer_secret: TWD_CONSUMER_SECRET,
  access_token_key: TWD_ACCESS_TOKEN,
  access_token_secret: TWD_ACCESS_TOKEN_SECRET
});

const get = promisify(client.get.bind(client));
const post = promisify(client.post.bind(client));

module.exports = {
  TWD_CONSUMER_KEY,
  TWD_CONSUMER_SECRET,
  TWD_ACCESS_TOKEN,
  TWD_ACCESS_TOKEN_SECRET,
  TWD_CACHE_FILE,
  TWD_WHITELIST_FILE,
  client,
  get,
  post
};

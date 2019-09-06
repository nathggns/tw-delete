const PromisePool = require("es6-promise-pool");

const { get, post, TWD_CACHE_FILE, TWD_WHITELIST_FILE } = require("./boostrap");
const { readFile, writeFile, prompt, run, sleep } = require("./util");

async function* findLastTweetOnDate(get, endDate, maxId) {
  const tweets = await get("statuses/user_timeline", {
    max_id: maxId,
    count: 200
  });

  for (const tweet of tweets) {
    if (new Date(tweet.created_at) < endDate) {
      if (yield tweet) {
        return;
      }
    }
  }
}

async function collectTweets(get, maxId, whitelist, collectedTweets) {
  if (!collectedTweets) {
    try {
      collectedTweets = JSON.parse(await readFile(TWD_CACHE_FILE));
    } catch (e) {
      if (!e.code === "ENOENT") {
        throw e;
      }

      collectedTweets = [];
    }
  }

  if (collectedTweets.length) {
    maxId = collectedTweets[collectedTweets.length - 1].id_str;
  }

  console.log("Collecting…", collectedTweets.length);

  const newTweets = await get("statuses/user_timeline", {
    max_id: maxId,
    count: 200
  });
  const filteredTweets = newTweets.filter(
    nTweet =>
      !whitelist.includes(nTweet.id) &&
      !collectedTweets.find(tw => nTweet.id_str === tw.id_str)
  );

  if (!filteredTweets.length) {
    return collectedTweets;
  }

  const tweets = [...collectedTweets, ...filteredTweets];
  await writeFile(TWD_CACHE_FILE, JSON.stringify(tweets));

  await sleep(1000);

  return await collectTweets(get, maxId, whitelist, tweets);
}

async function deleteTweet(post, tweet, retry = 0) {
  try {
    await post(`statuses/destroy/${tweet.id_str}`);
  } catch (e) {
    if (retry < 3) {
      return await deleteTweet(post, tweet, retry + 1);
    }

    // Ignore tweet already deleted
    if (!e || e.length !== 1 || e[0].code !== 144) {
      throw e;
    }
  }

  await sleep(100);
}

async function deleteTweets(post, tweets) {
  function* generator() {
    let newTweets = tweets;

    for (const [count, tweet] of Object.entries(tweets)) {
      console.log(`Deleting ${count}/${tweets.length}`);
      yield deleteTweet(post, tweet);

      newTweets = tweets.filter(tw => tw.id_str !== tweet);
      yield writeFile("./cache.json", JSON.stringify(newTweets));
    }
  }

  const pool = new PromisePool(generator, 5);

  await pool.start();
}

async function main([endDateString]) {
  if (!`${endDateString}`.match(/^\d{4}-\d{2}-\d{2}$/)) {
    console.error("Usage: ./tw-delete YYYY-MM-DD");
    return process.exit(1);
  }

  const endDate = new Date(`${endDateString}T23:59:59.999Z`);

  const whitelist = JSON.parse(await readFile(TWD_WHITELIST_FILE));

  console.log("Finding last tweet");

  let foundTweet;

  for await (let lastTweet of findLastTweetOnDate(get, endDate)) {
    if (whitelist.includes(lastTweet.id)) {
      continue;
    }

    const promptResult = await prompt(
      `Is this the last tweet you would like to delete?\n${
        lastTweet.text
      }: [Y/N] `
    );

    if (promptResult.match(/^\s*[Yy]\s*/)) {
      foundTweet = lastTweet;
      break;
    }
  }

  if (!foundTweet) {
    throw new Error("Could not find last tweet");
  }

  const tweets = await collectTweets(get, foundTweet.id_str, whitelist);

  const { toDelete, toReview } = tweets.reduce(
    (acc, tweet) => {
      const doesNotNeedReview =
        tweet.retweeted_status ||
        (tweet.retweet_count < 4 && tweet.favorite_count < 10);
      const group = doesNotNeedReview ? acc.toDelete : acc.toReview;

      group.push(tweet);

      return acc;
    },
    { toDelete: [], toReview: [] }
  );

  await deleteTweets(post, toDelete);

  for (const tweet of toReview) {
    const promptResult = await prompt(
      `Would you like to delete this high-quality tweet?\n${tweet.text}: [Y/N] `
    );

    if (promptResult.match(/^\s*[Yy]\s*/)) {
      console.log("Deleting…");
      await deleteTweet(post, tweet);
    } else {
      whitelist.push(tweet.id);
      await writeFile(TWD_WHITELIST_FILE, JSON.stringify(whitelist));
    }
  }

  await writeFile(TWD_CACHE_FILE, "[]");
}

run(main);

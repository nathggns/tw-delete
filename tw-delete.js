const Twitter = require("twitter");
const { promisify } = require('util');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const PromisePool = require('es6-promise-pool');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const {
  TWD_CONSUMER_KEY,
  TWD_CONSUMER_SECRET,
  TWD_ACCESS_TOKEN,
  TWD_ACCESS_TOKEN_SECRET,
  TWD_CACHE_FILE = path.resolve('./cache.json')
} = process.env;

if (!TWD_CONSUMER_KEY || !TWD_CONSUMER_SECRET || !TWD_ACCESS_TOKEN || !TWD_ACCESS_TOKEN_SECRET) {
    throw new Error('Invalid config');
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function findLastTweetOnDate(get, endDate, maxId, delay = 50, attempt = 1) {
    console.log(`Attempt ${attempt}`);
    const tweets = await get('statuses/user_timeline', { max_id: maxId, count: 200 });

    for (const tweet of tweets) {
        if ((new Date(tweet.created_at)) < endDate) {
            return tweet;
        }
    }

    if (attempt >= 5) {
        throw new Error(`Could not find last tweet on ${endDate}`);
    }

    await sleep(delay);

    const lastId = tweets[tweets.length - 1].id_str;
    return await findLastTweetOnDate(get, endDate, maxId, delay + 50, attempt + 1);
}

function prompt(prompt) {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        rl.question(prompt, answer => {
            rl.close();
            resolve(answer);
        });
    })
}

async function collectTweets(get, maxId, collectedTweets) {
    if (!collectedTweets) {
        try {
            collectedTweets = JSON.parse(await readFile(TWD_CACHE_FILE));
        } catch (e) {
            if (!e.code === 'ENOENT') {
                throw e;
            }

            collectedTweets = [];
        }
    }

    if (collectedTweets.length) {
        console.log(maxId, collectedTweets[collectedTweets.length - 1].id_str);
        maxId = collectedTweets[collectedTweets.length - 1].id_str;
    }

    console.log('Collecting…', collectedTweets.length);

    const newTweets = await get('statuses/user_timeline', { max_id: maxId, count: 200 });
    const filteredTweets = newTweets.filter(nTweet => !collectedTweets.find(tw => nTweet.id_str !== tw.id_str));

    if (!filteredTweets.length) {
        return collectedTweets;
    }

    console.log(`Found ${filteredTweets.length} tweets`);

    const tweets = [...collectedTweets, ...filteredTweets];
    await writeFile(TWD_CACHE_FILE, JSON.stringify(tweets));

    await sleep(1000);

    return await collectTweets(get, maxId, tweets);
}

async function deleteTweet(post, tweet) {

    await post(`statuses/destroy/${tweet.id_str}`);

    await sleep(100);
}

async function deleteTweets(post, tweets) {
    function* generator() {
        for (const [count, tweet] of Object.entries(tweets)) {
            console.log(`Deleting ${count}/${tweets.length}`);
            yield deleteTweet(post, tweet);
        }
    }

    const pool = new PromisePool(generator, 5);

    await pool.start();
}

async function main([ endDateString ]) {
    if (!`${endDateString}`.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.error('Usage: ./tw-delete YYYY-MM-DD');
        return process.exit(1);
    }

    const endDate = new Date(`${endDateString}T23:59:59.999Z`);

    const client = new Twitter({
        consumer_key: TWD_CONSUMER_KEY,
        consumer_secret: TWD_CONSUMER_SECRET,
        access_token_key: TWD_ACCESS_TOKEN,
        access_token_secret: TWD_ACCESS_TOKEN_SECRET,
    });

    const get = promisify(client.get.bind(client));
    const post = promisify(client.post.bind(client));

    console.log('Finding last tweet');

    const lastTweet = await findLastTweetOnDate(get, endDate);
    const promptResult = await prompt(`Is this the last tweet you would like to delete?\n${lastTweet.text}: [Y/N] `);

    if (!promptResult.match(/^\s*[Yy]\s*/)) {
        throw new Error('Could not find last tweet');
    }
    
    const tweets = await collectTweets(get, lastTweet.id_str);

    await deleteTweets(post, tweets);
    await writeFile('./cache.json', '[]');
}

main(process.argv.slice(2)).then(null, console.error);
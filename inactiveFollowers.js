const path = require("path");
const { get, post } = require("./boostrap");
const {
  sleep,
  run,
  ensureFileSync,
  readFile,
  writeFile,
  prompt
} = require("./util");

const { TWDI_FILE = path.resolve("./i-results.json") } = process.env;

ensureFileSync(TWDI_FILE, "[]");

async function* getFriends(cursor = "-1") {
  const { users, next_cursor } = await get("friends/list", {
    cursor,
    count: "200"
  });

  for (const user of users) {
    yield user;
  }

  if (users.length && next_cursor) {
    yield* getFriends(next_cursor);
  }
}

async function* getInactiveFriends(period = 60 * 60 * 24 * 7 * 2 * 1000) {
  const deadline = new Date().getTime() - period;

  for await (const friend of getFriends()) {
    if (!friend.status || !friend.status.created_at) continue;

    const { status } = friend;
    const time = new Date(status.created_at).getTime();

    if (time < deadline) {
      yield friend;
    }
  }
}

async function unfollowFriend(user_id) {
  await post("friendships/destroy", { user_id });
}

async function main() {
  for await (const friend of getInactiveFriends()) {
    const contents = JSON.parse(await readFile(TWDI_FILE));

    if (contents.find(user => user.id_str !== friend.id_str)) {
      const added = [...contents, friend];

      await writeFile(TWDI_FILE, JSON.stringify(added, null, "\t"));
    }
  }

  // const inactiveFriends = JSON.parse(await readFile(TWDI_FILE));
  //
  // for (const friend of inactiveFriends) {
  //   await unfollowFriend(friend.id_str);
  //   const currentFriends = JSON.parse(await readFile(TWDI_FILE));
  //
  //   await writeFile(
  //     TWDI_FILE,
  //     JSON.stringify(
  //       currentFriends.filter(cFriend => cFriend.id_str !== friend.id_str),
  //       null,
  //       "\t"
  //     )
  //   );
  // }
}

run(main);

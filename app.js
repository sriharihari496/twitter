const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const dbpath = path.join(__dirname, "twitterClone.db");

let db = null;

const connect = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error :${e.message}`);
    process.exit(1);
  }
};
connect();

const authenticate = (Request, Response, next) => {
  const { tweet } = Request.body;
  const { tweetId } = Request.params;
  let jwtToken;
  const authHeader = Request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    Response.status(401);
    Response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET", async (error, payload) => {
      if (error) {
        Response.status(401);
        Response.send("Invalid JWT Token");
      } else {
        Request.payload = payload;
        Request.tweetId = tweetId;
        Request.tweet = tweet;
      }
    });
  }
};

app.post("/register/", async (Request, Response) => {
  const { username, password, name, gender } = Request.body;
  const queryone = `SELECT * FROM user WHERE username='${username}';`;
  const dbuser = await db.get(queryone);
  if (dbuser === undefined) {
    if (password.length < 6) {
      Response.status(400);
      Response.send("Password is too short");
    } else {
      const hashed = await bcrypt.hash(password, 10);
      const createquery = `
          INSERT INTO 
           user(name, username, password, gender)
          VALUES( 
            '${name}',
            '${username}',
            '${hashed}',
            '${gender}');`;
      await db.run(createquery);
      Response.status(200);
      Response.send("User created successfully");
    }
  } else {
    Response.status(400);
    Response.send("User already exists");
  }
});

app.post("/login/", async (Request, Response) => {
  const { username, password } = Request.body;
  const querytwo = `
    SELECT 
    *
    FROM 
     user 
    WHERE 
     username='${username}';`;
  const dbuser = await db.get(querytwo);
  if (dbuser === undefined) {
    Response.status(400);
    Response.send("Invalid user");
  } else {
    const ispasswordmatched = await bcrypt.compare(password, dbuser.password);
    if (ispasswordmatched === true) {
      const jwtToken = jwt.sign(dbuser, "MY_SECRET");
      Response.send({ jwtToken });
    } else {
      Response.status(400);
      Response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticate, async (Request, Response) => {
  const { payload } = Request;
  const { user_id, name, username, gender } = payload;
  const getquery = `
     SELECT 
      username,
      tweet,
      date_time AS dateTime
    FROM 
      follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id INNER JOIN user ON user.user_id=follower.following_user_id
    WHERE 
     follower.follower_user_id=${user_id}
    ORDER BY 
      date_time DESC
    LIMIT 4;`;
  const tweetarray = await db.all(getquery);
  Response.send(tweetarray);
});

app.get("/user/following/", authenticate, async (Request, Response) => {
  const { payload } = Request;
  const { user_id, name, username, gender } = payload;
  const userquery = `
    SELECT 
     name
     FROM 
      user INNER JOIN follower ON user.user_id=follower.following_user_id
     WHERE 
      follower.follower_user_id=${user_id};`;
  const getuserquery = await db.all(userquery);
  Response.send(userquery);
});
app.get("/user/followers/", authenticate, async (Request, Response) => {
  const { payload } = Request;
  const { user_id, name, username, gender } = payload;
  const userquery = `
    SELECT 
     name
     FROM 
      user INNER JOIN follower ON user.user_id=follower.following_user_id
     WHERE 
      follower.follower_user_id=${user_id};`;
  const getuserquery = await db.all(userquery);
  Response.send(userquery);
});

app.get("/tweets/:tweetId/", authenticate, async (Request, Response) => {
  const { tweetId } = Request;
  const { payload } = Request;
  const { user_id, name, username, gender } = payload;
  const tweetsquery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetresult = await db.get(tweetsquery);
  const userfollowersquery = `
   SELECT 
   *
   FROM 
    follower INNER JOIN user ON user.user_id=follower.following_user_id
    WHERE 
     follower.follower_user_id=${user_id};`;
  const userfollowers = await db.all(userfollowersquery);

  if (
    userfollowers.some((item) => item.following_user_id === tweetresult.user_id)
  ) {
    const getTweetDetailsquery = `
     SELECT 
      tweet,
      COUNT(DISTINCT(like.like_id)) AS likes
      COUNT(DISTINCT(reply.reply_id)) AS replies,
      tweet.date_time AS dateTime
     FROM 
      tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id INNER JOIN reply ON reply.tweet_id=tweet.tweet_id
    WHERE 
     tweet.tweet_id=${tweetId} AND tweet.user_id=${userfollowers[0].user_id};`;
    const tweetDetails = await db.get(getTweetDetailsquery);
    Response.send(tweetDetails);
  } else {
    Response.status(400);
    Response.send("Invalid Request");
  }
});

app.get("/tweets/:tweetId/likes/", authenticate, async (Request, Response) => {
  const { tweetId } = Request;
  const { payload } = Request;
  const { user_id, name, username, gender } = payload;
  const getlikedquery = `
    SELECT 
    *
    FROM 
     follower INNER JOIN tweet ON tweet.user_id=follower.following_user_id INNER JOIN like ON like.tweet_id=tweet.tweet_id
     INNER JOIN user ON user.user_id=like.user_id
    WHERE 
      tweet.tweet_id=${tweetId} AND follower.follower_user_id=${user_id};`;
  const likedusers = await db.all(getlikedquery);
  if (likedusers.length !== 0) {
    let likes = [];
    const getnamesarray = (likedusers) => {
      for (let item of likedusers) {
        likes.push(item.username);
      }
    };
    getnamesarray(likedusers);
    Response.send({ likes });
  } else {
    Response.status(401);
    Response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  async (Request, Response) => {
    const { tweetId } = Request;
    const { payload } = Request;
    const { user_id, name, username, gender } = payload;
    const getreplie = `
     SELECT 
     *
     FROM 
      follower INNER JOIN tweet ON tweet.user_id=follower.following_user_id INNER JOIN reply ON reply.tweet_id=tweet.tweet_id
       INNER JOI user ON user.user_id=reply.user_id
    WHERE 
     tweet.tweet_id=${tweetId} AND follower.follower_user_id=${user_id};`;
    const replie = await db.all(getreplie);
    if (replie.length !== 0) {
      let replies = [];
      const getnamesarray = (replie) => {
        for (let item of replie) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getnamesarray(replie);
      Response.send({ replies });
    } else {
      Response.status(401);
      Response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticate, async (Request, Response) => {
  const { payload } = Request;
  const { user_id, name, username, gender } = payload;
  const getTweetsdetails = `
     SELECT 
      tweet.tweet AS tweet,
      COUNT (DISTINCT(like.like_id)) AS likes,
      COUNT (DISTINCT(reply.reply_id)) AS replies,
      tweet.date_time AS dateTime
    FROM 
     user INNER JOIN tweet ON user.user_id=tweet.user_id INNER JOIN like ON like.tweet_id=tweet.tweet_id
    WHERE 
     user.user_id=${user_id}
    GROUP BY 
     tweet.tweet_id;`;
  const tweetsDetails = await db.all(getTweetsdetails);
  Response.send(tweetsDetails);
});

app.post("/user/tweets/", authenticate, async (Request, Response) => {
  const { tweetId } = Request;
  const { payload } = Request;
  const { user_id, name, username, gender } = payload;
  const postTweet = `
    INSERT INTO 
     tweet(tweet, user_id)
    VALUES(
     '${tweet}',
     ${user_id});`;
  await db.run(postTweet);
  Response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authenticate, async (Request, Response) => {
  const { tweetId } = Request;
  const { payload } = Request;
  const { user_id, name, username, gender } = payload;
  const selectuserquery = `SELECT * FROM tweet WHERE tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId};`;
  const tweetuser = await db.all(selectuserquery);
  if (tweetuser.length !== 0) {
    const deletequery = `
         DELETE FROM tweet
         WHERE
          tweet.user_id=${user_id} AND tweet.tweet_id=${tweetId};`;
    await db.run(deletequery);
    Response.send("Tweet Removed");
  } else {
    Response.status(401);
    Response.send("Invalid Request");
  }
});
module.exports = app;

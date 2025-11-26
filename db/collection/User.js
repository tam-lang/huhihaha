const jwt = require("jsonwebtoken");

async function loginProcess(email, password) {
  const database = global.db.database;
  const ObjectId = global.db.ObjectId;
  const users = database.collection("users");
  const user = await users.findOne({ email, password });
  if (user) {
    if (user.ban) throw new Error("Tài khoản của bạn đã bị khóa!");
    const token = jwt.sign(user, process.env.SECREST_JWT, {
      expiresIn: "30d", // Token sẽ hết hạn sau 30 ngày
    });
    return token;
  } else {
    throw new Error("Tài khoản hoạc mật khẩu không hợp lệ!");
  }
}

async function showUsers() {
  const database = global.db.database;
  const users = database.collection("users");
  const user = await users.find().toArray();
  return user;
}

async function delUser(id) {
  const database = global.db.database;
  const ObjectId = global.db.ObjectId;
  try {
    const users = database.collection("users");
    await users.deleteOne({ _id: new ObjectId(id) });
  } catch (error) {
    throw error;
  }
}

async function checkUser(data) {
  try {
    const database = global.db.database;
    const users = database.collection("users");
    const user = await users.findOne(data);
    return user;
  } catch (error) {
    throw error;
  }
}

async function createUser(data) {
  const database = global.db.database;
  try {
    const users = database.collection("users");
    data.ban = false;
    data.create_at = Date.now();
    data.update_at = Date.now();
    data.apikey = generateRandomString(10);
    const user = await users.insertOne(data);
    return user;
  } catch (error) {
    throw error;
  }
}

function generateRandomString(length) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

async function showEditUsers(id) {
  try {
    const database = global.db.database;
    const ObjectId = global.db.ObjectId;
    const users = database.collection("users");
    const user = await users.findOne({ _id: new ObjectId(id) });
    return user;
  } catch (error) {
    throw error;
  }
}

async function updateUser(id, data) {
  try {
    const database = global.db.database;
    const ObjectId = global.db.ObjectId;
    const users = database.collection("users");
    data.update_at = Date.now();
    const user = await users.updateOne(
      { _id: new ObjectId(id) },
      { $set: data }
    );
    return user;
  } catch (error) {
    throw error;
  }
}

async function findUser(data) {
  try {
    const database = global.db.database;
    const users = database.collection("users");
    const user = await users.find(data).toArray();
    return user;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  loginProcess,
  showUsers,
  createUser,
  checkUser,
  showEditUsers,
  updateUser,
  delUser,
  generateRandomString,
  findUser,
};

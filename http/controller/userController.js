const User = require("../../db/collection/User");

const fs = require("fs");
const path = require("path");
const bannedIPsFile = path.join(
  __dirname,
  "..",
  "..",
  "saveFolder",
  "banIPs.json"
);

function loadBannedIPs() {
  try {
    const data = fs.readFileSync(bannedIPsFile, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.log("Failed to read banned IPs file:", error);
    return {};
  }
}

function message(req) {
  const errorMessage = req.session.errorMessage;
  delete req.session.errorMessage;
  const successMessage = req.session.successMessage;
  delete req.session.successMessage;
  return { errorMessage, successMessage };
}

async function dashboard(req, res) {
  const { errorMessage, successMessage } = message(req);
  const database = global.db.database;
  const users = database.collection("users");
  const totalUsers = await users.countDocuments()
  const totalApis = global.detailApis.length;

  const listIPs = loadBannedIPs();
  const totalIPs = Object.keys(listIPs).length;

  const month = new Date().toISOString().slice(0, 7); // Lấy tháng hiện tại
  const requestsPerMonth = {};

  for (const ip in listIPs) {
    const ipData = listIPs[ip];
    if (ipData.monthlyStats) {
      ipData.monthlyStats.forEach((stat) => {
        const { month, count } = stat;
        // Nếu tháng chưa tồn tại trong đối tượng, khởi tạo với giá trị 0
        if (!requestsPerMonth[month]) {
          requestsPerMonth[month] = 0;
        }
        // Cộng dồn số request của tháng đó
        requestsPerMonth[month] += count;
      });
    }
  }

  let bannedCount = 0;
  const currentTime = Date.now();

  for (const ip in listIPs) {
    if (listIPs[ip].banned && listIPs[ip].banned > currentTime) {
      bannedCount++; // Tăng số lượng nếu IP đang bị ban
    }
  }

  res.render("pages/index", {
    title: "Admin Home",
    detailApis: global.detailApis,
    totalUsers,
    totalApis,
    totalIPs,
    requestsPerMonth,
    bannedCount,
    month,
    errorMessage,
    successMessage,
  });
}

function login(req, res) {
  const { errorMessage, successMessage } = message(req);
  if(req.cookies?.hungdev_token) return res.redirect("/dashboard");
  res.render("pages/auth/login", {
    auth: true,
    title: "Admin Login",
    errorMessage,
    successMessage,
  });
}

async function loginProcess(req, res) {
  try {
    const token = await User.loginProcess(req.body.email, req.body.password);
    res.cookie("hungdev_token", token, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
    });

    req.session.successMessage = "Đăng nhập thành công!";
    res.redirect("/dashboard");
  } catch (error) {
    res.render("pages/auth/login", {
      auth: true,
      errorMessage: error.message,
    });
  }
}

async function signup(req, res) {
  const { errorMessage, successMessage } = message(req);
  if(req.cookies?.hungdev_token) return res.redirect("/dashboard");
  res.render("pages/auth/signup", {
    auth: true,
    title: "Admin Signup",
    errorMessage,
    successMessage,
  });
}

function logout(req, res) {
  res.clearCookie("hungdev_token", { path: "/" });
  req.session.successMessage = "Đăng xuất thành công!";
  res.redirect("/login");
}

async function showUsers(req, res) {
  const { errorMessage, successMessage } = message(req);
  const limit = 10;
  let page = req.query.page || 1;
  const search = req.query.search;

  let users = await User.showUsers();

  if (search) {
    users = users.filter(user => user._id.toString().includes(search) || user.email.includes(search) || user.name.includes(search));
  }
  const totalRecords = users.length;
  const totalPages = Math.ceil(totalRecords / limit);
  page = page > totalPages ? totalPages : parseInt(page);
  const thisUsers = users.slice((page - 1) * limit, page * limit);

  res.render("pages/users/index", {
    title: "Quản lý người dùng",
    users: thisUsers,
    pagination: {
      page,
      totalPages,
      startCount: (page - 1) * limit + 1,
    },
    detailApis: global.detailApis,
    errorMessage,
    successMessage,
  });
}

async function createUser(req, res) {
  try {
    const { name, email, phone, role, password } = req.body;
    if (!name || !email || !phone || !role || !password) {
      req.session.errorMessage = "Vui lòng điền đầy đủ thông tin!";
      res.redirect("/users");
    }
    const user = await User.checkUser({ email });
    if (user) {
      req.session.errorMessage = "Email đã tồn tại!";

      return res.redirect("back");
    }
    req.session.successMessage = "Tạo người dùng thành công!";
    await User.createUser(req.body);
    res.redirect("/users");
  } catch (error) {
    req.session.errorMessage = error.message;

    res.redirect("/users");
  }
}

async function showEditUsers(req, res) {
  try {
    const id = req.params.id;
    const users = await User.showEditUsers(id);
    return res.json(users);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
}

async function storeUser(req, res) {
  const id = req.params.id;
  const { name, email, phone, role, password, apikey, ban } = req.body;

  let updateData = {};

  // Kiểm tra từng biến và thêm vào obj `updateData` nếu không phải undefined
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (phone !== undefined) updateData.phone = phone;
  if (role !== undefined) updateData.role = role;
  if (password !== undefined) updateData.password = password;
  if (apikey !== undefined) updateData.apikey = apikey;
  if (ban !== undefined) updateData.ban = ban == "true" ? false : true;
  // console.log(updateData);

  try {
    // Tìm người dùng khác có cùng email (ngoại trừ chính người dùng hiện tại)
    if (email !== undefined) {
      const ObjectId = global.db.ObjectId;
      // Chuyển id sang ObjectId
      const objectId = new ObjectId(id);
      const existingUser = await User.checkUser({
        email: email,
        _id: { $ne: objectId },
      });
      if (existingUser) {
        req.session.errorMessage =
          "Email này đã được sử dụng bởi người dùng khác!";
        return res.redirect("/users");
      }
    }

    await User.updateUser(id, updateData);
    req.session.successMessage = "Cập nhật người dùng thành công!";
    res.redirect("/users");
  } catch (error) {
    req.session.errorMessage = "Lỗi: " + error.message;
    res.redirect("/users");
  }
}

async function delUser(req, res) {
  const id = req.body.id;
  try {
    await User.delUser(id);
    req.session.successMessage = "Xóa người dùng thành công!";
    res.redirect("/users");
  } catch (error) {
    req.session.errorMessage = "Lỗi: " + error.message;
    res.redirect("/users");
  }
}

async function detailApi(req, res) {
  const apiPath = req.params[0]
  const detail = global.detailApis.find((api) => api.path == '/' + apiPath);
  if (!detail) {
    req.session.errorMessage = "Không tìm thấy API!";
    return res.redirect("back")
  }
  const { errorMessage, successMessage } = message(req);
  res.render("pages/docApis/detailApi", {
    title: detail.name,
    detail,
    detailApis: global.detailApis,
    errorMessage,
    successMessage,
  });
}
let otps = [];
async function sendMail({ email, subject, text }, type) {
  if (type == "forgot" || type == "signup") {
    var otp = Math.floor(100000 + Math.random() * 900000);
    otps.push({ email, otp, ts: Date.now(), type });
  }
  // Gửi email
  const form = {
    from: '"Hùng Dev" <admin@hungdev.id.vn>', // Người gửi
    to: email, // Người nhận
    subject: subject ? subject : "Your API Access Code", // Tiêu đề email
    text: text
      ? text
      : `Dear user,\n\nYour code is: ${otp}\n\nUse it to access your account.\n\nIf you didn't request this, simply ignore this message.\n\nYours,\nThe HungDev Team`, // Nội dung email dạng văn bản thuần
  };
  try {
    await global.others.sendMail(email, form);
  } catch (error) {
    throw error;
  }
}

async function verifyEmail(req, res) {
  const email = req.body.email;
  const type = req.body.type;
  if (!email.endsWith("@gmail.com"))
    return res.json({
      success: false,
      message: "Email không hợp lệ, chỉ hỗ trợ gmail!",
    });
  const find = otps.find((o) => o.email === email && type == o.type);
  if (find) {
    if (find.ts + 60000 > Date.now())
      return res.json({
        success: false,
        message: "Vui lòng đợi 1 phút trước khi gửi lại mã OTP!",
      });
    otps = otps.filter((o) => o.email !== email);
  }
  try {
    const user = await User.checkUser({ email });
    if (type == "signup") {
      if (user) {
        return res.json({
          success: false,
          message: "Email đã tồn tại!",
        });
      }
      await sendMail({ email }, type);
      return res.json({
        success: true,
        message: "Mã xác minh đã được gửi đến email của bạn!",
      });
    } else if (type == "forgot") {
      if (!user) {
        return res.json({
          success: false,
          message: "Email không tồn tại!",
        });
      }
      await sendMail({ email }, type);
      return res.json({
        success: true,
        message: "Mã xác minh đã được gửi đến email của bạn!",
      });
    }
  } catch (error) {
    return res.json({
      success: false,
      message: error.message,
    });
  }
}

async function signupProcess(req, res) {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      req.session.errorMessage = "Vui lòng điền đầy đủ thông tin!";
      return res.redirect("/signup");
    }
    if (email.endsWith("@gmail.com") == false) {
      req.session.errorMessage = "Email không hợp lệ, chỉ hỗ trợ gmail!";
      return res.redirect("/signup");
    }
    if (!isValidPhoneNumber(phone)) {
      req.session.errorMessage = "Số điện thoại không hợp lệ!";
      return res.redirect("/signup");
    }
    const findOne = otps.find((o) => o.email === email && o.type == "signup");
    if (!findOne) {
      req.session.errorMessage = "Vui lòng xác minh email trước!";
      return res.redirect("/signup");
    }
    console.log(findOne, req.body.otp);
    if (findOne.otp != req.body.otp) {
      req.session.errorMessage = "Mã xác minh không chính xác!";
      return res.redirect("/signup");
    }
    otps = otps.filter((o) => o.email !== email);
    req.body.role = 2;
    delete req.body.otp;
    await User.createUser(req.body);
    req.session.successMessage = "Tạo người dùng thành công!";
    res.redirect("/login");
  } catch (error) {
    req.session.errorMessage = error.message;
    res.redirect("/signup");
  }
}

async function showEditProfile(req, res) {
  const { errorMessage, successMessage } = message(req);
  res.render("pages/users/editProfile", {
    title: "Edit Profile",
    errorMessage,
    successMessage,
  });
}

async function saveEditProfile(req, res) {
  const id = res.locals.user._id;
  const { name, email, phone, oldPassword, newPassword, rePassword, type } =
    req.body;
  let data = {};
  if (type == "getapikey") {
    data.apikey = User.generateRandomString(10);

    try {
      await User.updateUser(id, data);
      return res.json({
        success: true,
        message: "Cập nhật thông tin thành công!",
        data,
      });
    } catch (error) {
      return res.json({
        success: false,
        message: error.message,
      });
    }
  } else if (type == "password") {
    if (newPassword !== rePassword) {
      req.session.errorMessage =
        "Mật khẩu mới không khớp với nhập lại mật khẩu!";
      return res.redirect("/edit-profile");
    }
    if (oldPassword !== res.locals.user.password) {
      req.session.errorMessage = "Mật khẩu cũ không chính xác!";
      return res.redirect("/edit-profile");
    }
    data.password = newPassword;
  } else {
    if (!name || !email || !phone) {
      req.session.errorMessage = "Vui lòng điền đầy đủ thông tin!";
      return res.redirect("/edit-profile");
    }
    if (!email.endsWith("@gmail.com")) {
      req.session.errorMessage = "Email không hợp lệ, chỉ hỗ trợ gmail!";
      return res.redirect("/edit-profile");
    }
    const ObjectId = global.db.ObjectId;
    // Chuyển id sang ObjectId
    const objectId = new ObjectId(id);
    const existingUser = await User.checkUser({
      email: email,
      _id: { $ne: objectId },
    });
    if (existingUser) {
      req.session.errorMessage =
        "Email này đã được sử dụng bởi người dùng khác!";
      return res.redirect("/edit-profile");
    }
    if (!isValidPhoneNumber(phone)) {
      req.session.errorMessage = "Số điện thoại không hợp lệ!";
      return res.redirect("/edit-profile");
    }
    data.name = name;
    data.email = email;
    data.phone = phone;
  }

  try {
    await User.updateUser(id, data);
    req.session.successMessage = "Cập nhật thông tin thành công!";
    return res.redirect("/edit-profile");
  } catch (error) {
    res.session.errorMessage = error.message;
    return res.redirect("/edit-profile");
  }
}

function isValidPhoneNumber(phone) {
  // Biểu thức chính quy kiểm tra định dạng số điện thoại
  const phoneRegex = /^[0-9]{10,11}$/; // Số điện thoại phải có 10 hoặc 11 chữ số

  return phoneRegex.test(phone);
}

async function overview(req, res) {
  const { errorMessage, successMessage } = message(req);
  res.render("pages/docApis/overview", {
    title: "Tổng quan API",
    errorMessage,
    successMessage,
  });
}

async function getFormForgotPassword(req, res) {
  const { errorMessage, successMessage } = message(req);
  if(req.cookies?.hungdev_token) return res.redirect("/dashboard");
  res.render("pages/auth/forGot", {
    auth: true,
    title: "Forgot Password",
    errorMessage,
    successMessage,
  });
}

async function getPass(req, res) {
  const email = req.body.email;
  const otp = req.body.otp;
  if (!email || !otp) {
    req.session.errorMessage = "Vui lòng điền đầy đủ thông tin!";
    return res.redirect("back");
  }
  if (email.endsWith("@gmail.com") == false) {
    req.session.errorMessage = "Email không hợp lệ, chỉ hỗ trợ gmail!";
    return res.redirect("back");
  }
  const findOne = otps.find((o) => o.email === email && o.type == "forgot");
  if (!findOne) {
    req.session.errorMessage = "Vui lòng xác minh email trước!";
    return res.redirect("back");
  }
  if (findOne.otp != otp) {
    req.session.errorMessage = "Mã xác minh không chính xác!";
    return res.redirect("back");
  }
  otps = otps.filter((o) => o.email !== email);
  const newPassword = User.generateRandomString(8);
  try {
    const user = await User.checkUser({ email });

    await User.updateUser(user._id, { password: newPassword });
    const form = {
      email,
      subject: "Your new password",
      text: `Dear user,\n\nYour new password is: ${newPassword}\n\nUse it to access your account.\n\nIf you didn't request this, simply ignore this message.\n\nYours,\nThe HungDev Team`,
    };
    await sendMail(form, "sendPass");
    req.session.successMessage = "Mật khẩu mới đã được gửi đến email của bạn!";
    res.redirect("/login");
  } catch (error) {
    console.log(error);
    req.session.errorMessage = error.message;
    res.redirect("back");
  }
}

async function searchApi(req, res) {
  const keyword = req.query.query;
  const apis = global.detailApis
    .map((api, index) => {
      return {
        path: api.path,
        name: api.name,
        description: api.description,
        method: api.method,
        index,
      };
    }) // Chuyển đổi thành mảng đối tượng với thông tin API và chỉ số
    .filter((item) => item.name.toLowerCase().includes(keyword.toLowerCase()));
  if (res.locals.user.role < 2) {
    try {
      var users = await User.findUser({
        $or: [
          { email: { $regex: keyword, $options: "i" } }, // Tìm email
          { name: { $regex: keyword, $options: "i" } }, // Tìm name
        ],
      });
      const listIPs = loadBannedIPs();
      var ips = Object.keys(listIPs).map((ip) => {
        return {
          ip,
          banned: listIPs[ip].banned,
        };
      })
      ips = ips.filter((item) => item.ip.includes(keyword));
    } catch (error) {
      console.error(error);
      var users = [];
      var ips = [];
    }
  }
  var users = users
    ? users.map((user) => {
        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          ban: user.ban,
        };
      })
    : [];

  res.json({
    apis,
    users,
    ips,
  });
}

module.exports = {
  dashboard,
  login,
  logout,
  showUsers,
  loginProcess,
  signup,
  createUser,
  storeUser,
  showEditUsers,
  detailApi,
  signupProcess,
  verifyEmail,
  delUser,
  showEditProfile,
  saveEditProfile,
  overview,
  getFormForgotPassword,
  getPass,
  searchApi,
};

const jwt = require("jsonwebtoken");

function baseUrl(req) {
  return req.protocol + "://" + req.get("host");
}

// Hàm xác minh token và kiểm tra quyền truy cập
async function verifyToken(token, requiredRole) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.SECREST_JWT, (err, decoded) => {
      if (err) {
        return reject(err);
      }
      // Kiểm tra quyền của người dùng
      if (decoded.role > requiredRole) {
        return reject(new Error("Không có quyền truy cập!"));
      }
      return resolve(decoded);
    });
  });
}

// Hàm xác thực chung
async function authMiddleware(req, res, next, requiredRole) {
  try {
    const token = req.cookies.hungdev_token;
    if (!token) {
      return res.render("pages/auth/login", {
        auth: true,
        baseUrl: baseUrl(req),
      });
    }

    // Xác minh token và kiểm tra quyền truy cập
    const { email, password, ban, role } = await verifyToken(
      token,
      requiredRole
    );
    const database = global.db.database;
    const users = database.collection("users");
    const user = await users.findOne({ email, password, ban, role });
    if (!user) {
      req.session.errorMessage = "Token không hợp lệ!";
      res.clearCookie("hungdev_token", { path: "/" });
      return res.redirect("/login");
    }
    res.locals.user = user;
    return next();
  } catch (err) {
    console.error(err);
    const previousUrl = req.headers.referer || "/"; // Lấy trang trước hoặc trang chủ nếu không có

    // Kiểm tra nếu lỗi là do token hết hạn hoặc quyền không hợp lệ
    if (err.name === "TokenExpiredError") {
      res.clearCookie("hungdev_token", { path: "/" });
      return res.render("pages/auth/login", {
        auth: true,
        errorMessage: "Tài khoản đã bị đăng xuất, vui lòng đăng nhập lại!",
        baseUrl: baseUrl(req),
      });
    } else if (err.message === "Không có quyền truy cập!") {
      return res.redirect(previousUrl); // Quay lại trang trước đó
    }
    return res.render("pages/auth/login", {
      auth: true,
      errorMessage: "Token không hợp lệ, vui lòng đăng nhập lại!",
      baseUrl: baseUrl(req),
    });
  }
}

// Tạo các middleware cho từng loại xác thực
function authDev(req, res, next) {
  return authMiddleware(req, res, next, 0); // Quyền Dev
}

function authAdmin(req, res, next) {
  return authMiddleware(req, res, next, 1); // Quyền Admin
}

function authUser(req, res, next) {
  return authMiddleware(req, res, next, 2); // Quyền User
}

module.exports = { authDev, authAdmin, authUser };

require("dotenv").config();
const cors = require('cors');
const express = require("express");
const cookieParser = require('cookie-parser');
const session = require('express-session');
const Queue = require('express-queue');
const reload = require('express-reload');
const rateLimit = require("express-rate-limit");
const expressLayouts = require('express-ejs-layouts');
const favicon = require('serve-favicon'); 
const app = express();
const fs = require("fs");
const path = require("path");
const { checkBan, countRequest, checkRequestFrequency, handleRateLimit } = require("./middlewares/banIPs");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const uri = process.env.MONGODB_URI;


// app.use(reload(__dirname + '/http/routes.js', { watch: true }));
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
  },
  ssl: true, // Thêm tùy chọn SSL
});
global.db = {
  ObjectId
}
require("./db")(client)

const authMiddleware = require("./middlewares/authMiddleware"); // Import middleware

const directory = path.join(__dirname, 'saveFolder', 'cache');
if (fs.existsSync(directory)) {
    // Nếu thư mục đã tồn tại, xóa tất cả các file và thư mục con
    fs.readdirSync(directory).forEach(file => {
        const filePath = path.join(directory, file);
        if (fs.lstatSync(filePath).isDirectory()) {
            // Xóa thư mục con nếu có
            fs.rmdirSync(filePath, { recursive: true });
        } else {
            // Xóa file
            fs.unlinkSync(filePath);
        }
    });
    console.log('Thư mục đã được làm trống');
} else {
    // Nếu thư mục chưa tồn tại, tạo mới
    fs.mkdirSync(directory, { recursive: true });
    console.log('Thư mục mới đã được tạo');
}

app.set('trust proxy', 1); // Tin tưởng proxy gần nhất

const queueMw = Queue({
  activeLimit: 1000,
  queuedLimit: 100, // Giới hạn hàng đợi là 100 yêu cầu (hoặc không giới hạn với -1)
  rejectHandler: (req, res) => {
    // Xử lý khi yêu cầu bị từ chối do quá tải
    res.status(503).json({
      success: false,
      message: 'Server đang quá tải, vui lòng thử lại sau!',
    });
  }
});
app.use(cors({
  origin: '*', // Cho phép mọi nguồn
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Các phương thức cho phép
  credentials: true, // Nếu cần thiết để gửi cookie
}));
app.use(express.json({ limit: '50mb' }));
app.use(session({
  secret: 'secret_key',
  resave: false,
  saveUninitialized: true,
}));
app.use(countRequest)
app.use(cookieParser());
app.use(expressLayouts);
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(queueMw);
app.use(favicon(path.join(__dirname, 'public', 'images', 'favicon.png'))); // Thêm dòng này
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/app'); 

global.escapes = ['/', '/apiDoc']

app.use((req, res, next) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const routePath = req.path;
  const banInfo = checkBan(clientIp);
  if (banInfo.isBanned) {
    console.log(
      `IP: ${clientIp} - has been banned. Time remaining: ${banInfo.timeLeftInMinutes} minutes and ${banInfo.timeLeftInSeconds} seconds.`
    );
    return res.status(403).json({
      success: false,
      message: `Your IP has been banned. Time remaining: ${banInfo.timeLeftInMinutes} minutes and ${banInfo.timeLeftInSeconds} seconds.`,
    });
  }
  console.log(`IP: ${clientIp} - Đang truy cập vào route: ${routePath}`);
  next();
});




const limiter = rateLimit({
  windowMs: 60 * 1000, // Cửa sổ 1 phút
  max: (req) => {
    if (global.escapes.includes(req.path)) {
      return 1000;
    }
    return req.rlpp || 100; // Đặt giới hạn là 100 cho các đường dẫn khác
  },
  handler: handleRateLimit, // Hàm xử lý khi quá giới hạn
});

// Áp dụng rate limiter cho tất cả các route
// app.use(limiter);

// Hàm chuyển đổi đường dẫn file thành route
function convertPathToRoute(filePath) {
  const relativePath = path.relative(path.join(__dirname, "routes"), filePath);
  const routePath = "/" + relativePath.replace(/\\/g, "/").replace(/\.js$/, "");
  return routePath;
}

function authorizeRole(roleRequired) {
  return (req, res, next) => {
    if (typeof req.role === 'undefined' || req.role > roleRequired) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập vào route này!",
      });
    }
    next();
  };
}


let cArgs = []
function loadRoutesFromDir(dir) {
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Nếu là thư mục, tiếp tục duyệt vào trong
      loadRoutesFromDir(fullPath);
    } else if (file.endsWith(".js")) {
      // Nếu là file .js, nạp route
      const route = require(fullPath);

      // Chuyển đường dẫn file thành route path
      const routePath = convertPathToRoute(fullPath);
      // Kiểm tra xem route có `index` hay không
      if (route.index) {
        cArgs.push({
          ...route.config,
          path: routePath,
        })
        const method = route.config.method || "get"; // Mặc định là GET nếu không khai báo
        const roleRequired = route.config.role || 3
        if(roleRequired === 3) global.escapes.push(routePath)
        app[method](routePath, authMiddleware, checkRequestFrequency, authorizeRole(roleRequired), limiter, route.index);
        console.log(`Loaded route: ${routePath} from file: ${fullPath}`);
      }
    }
  });
}

// Tải các route từ thư mục
loadRoutesFromDir(path.join(__dirname, "routes"));

global.detailApis = cArgs;

require("./http/routes")(app);
// Hiển thị file index.html và chèn danh sách API vào
app.get("/", function (req, res) {
  // res.render("index");
  res.render("profile", { layout: false })
});

app.get("/apiDoc", function (req, res) {
 
  // res.render("apiDoc", { configs: cArgs, layout: false });
  res.redirect('/login')
});

const port = 80;
app.listen(port, () => {
  console.log(`myApi is listening on port ${port}`);
});

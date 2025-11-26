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

async function showIPs(req, res) {
  const { errorMessage, successMessage } = message(req);
  const limit = 10;
  let page = req.query.page || 1;
  const search = req.query.search;

  const listIPs = loadBannedIPs();
  const month = new Date().toISOString().slice(0, 7); // Lấy tháng hiện tại
  let newArr = Object.keys(listIPs).map((ip) => {
    const item = listIPs[ip];
    // Lọc ra thống kê theo tháng hiện tại
    const monthlyStat = item.monthlyStats.find((stat) => stat.month === month);
    // Tính tổng số request
    const totalRequest = item.monthlyStats.reduce(
      (acc, stat) => acc + stat.count,
      0
    );

    return {
      ip: ip,
      banned: item.banned,
      requestCount: monthlyStat ? monthlyStat.count : 0,
      totalRequest: totalRequest,
      lastTimestamp: item.lastTimestamp,
    };
  });
  newArr.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  if(search) {
    newArr = newArr.filter(item => item.ip.includes(search));
  }
  const totalRecords = newArr.length;
  const totalPages = Math.ceil(totalRecords / limit);
  page = page > totalPages ? totalPages : parseInt(page);
  const thisIPs = newArr.slice((page - 1) * limit, page * limit);
  res.render("pages/IPs/showIPs", {
    title: "Quản lý IPs",
    listIPs: thisIPs,
    pagination: {
      page,
      totalPages,
      startCount: (page - 1) * limit + 1,
    },
    errorMessage,
    successMessage,
  });
}

async function updateIPs(req, res) {
  const { ip } = req.params;
  const { date } = req.body;

  console.log(date, ip); // Xem giá trị date và ip để kiểm tra

  try {
    const listIPs = loadBannedIPs();
    const item = listIPs[ip];

    if (!item) {
      req.session.errorMessage = "IP không tồn tại";
      return res.redirect("/ips");
    }

    // Chuyển đổi date thành timestamp
    const bannedTimestamp = Date.parse(date);
    if (isNaN(bannedTimestamp)) {
      req.session.errorMessage = "Ngày không hợp lệ";
      return res.redirect("/ips");
    }

    item.banned = bannedTimestamp;

    // Ghi lại danh sách IP vào file
    fs.writeFileSync(bannedIPsFile, JSON.stringify(listIPs, null, 2));

    // Đến trang ips sau khi cập nhật thành công
    req.session.successMessage = "Cập nhật IP thành công";
    return res.redirect("/ips");
  } catch (error) {
    console.error("Failed to update IPs:", error);
    req.session.errorMessage = "Có lỗi xảy ra";
    return res.redirect("/ips");
  }
}


module.exports = {
  showIPs,
  updateIPs,
};

const fs = require('fs');
const path = require('path');

const bannedIPsFile = path.join(__dirname, '..', 'saveFolder', 'banIPs.json');
const requestCounts = {}; // Để theo dõi số lần truy cập của mỗi IP
const REQUEST_LIMIT = 7; // Số lần truy cập tối đa trong khoảng thời gian
const TIME_FRAME = 10000; // 10 giây (10 giây tính bằng milliseconds)

// Hàm đọc danh sách IP bị cấm từ file
function loadBannedIPs() {
    try {
        const data = fs.readFileSync(bannedIPsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('Failed to read banned IPs file:', error);
        return {};
    }
}

// Hàm lưu danh sách IP bị cấm và thống kê
function saveBannedIPs(bannedIPs) {
    try {
        fs.writeFileSync(bannedIPsFile, JSON.stringify(bannedIPs, null, 4), 'utf8');
    } catch (error) {
        console.log('Failed to write banned IPs file:', error);
    }
}

// Hàm kiểm tra xem IP có bị cấm không
function checkBan(clientIp) {
    const bannedIPs = loadBannedIPs(); // Luôn đọc từ file
    const banData = bannedIPs[clientIp];
    
    if (banData && banData.banned) {
        const timeLeft = banData.banned - Date.now();

        // Nếu thời gian cấm đã hết, xóa IP khỏi danh sách cấm
        if (timeLeft <= 0) {
            return { isBanned: false };
        }

        const timeLeftInMinutes = Math.floor(timeLeft / (1000 * 60));
        const timeLeftInSeconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

        return {
            isBanned: true,
            timeLeftInMinutes,
            timeLeftInSeconds
        };
    }

    return { isBanned: false };
}

// Hàm cấm IP và giữ nguyên thống kê cũ
function banIp(clientIp, durationMs) {
    const bannedIPs = loadBannedIPs(); // Luôn đọc từ file
    const existingData = bannedIPs[clientIp] || {};

    bannedIPs[clientIp] = {
        banned: Date.now() + durationMs,
        monthlyStats: existingData.monthlyStats || [], // Giữ lại dữ liệu thống kê cũ
        lastTimestamp: Date.now(),
    };

    saveBannedIPs(bannedIPs); // Lưu lại thay đổi
}

// Hàm đếm truy cập và thống kê
function countRequest(req, res, next) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const bannedIPs = loadBannedIPs(); // Luôn đọc từ file

    if (!bannedIPs[clientIp]) {
        bannedIPs[clientIp] = {
            banned: null,
            monthlyStats: [],
            lastTimestamp: Date.now(),
        };
    }

    const ipData = bannedIPs[clientIp];
    let monthStat = ipData.monthlyStats.find(stat => stat.month === currentMonth);

    // Nếu không có dữ liệu cho tháng hiện tại, tạo mới
    if (!monthStat) {
        monthStat = { month: currentMonth, count: 0 };
        ipData.monthlyStats.push(monthStat);
    }

    // Tăng số lượng request cho tháng hiện tại
    monthStat.count++;
    ipData.lastTimestamp = Date.now();

    saveBannedIPs(bannedIPs); // Lưu lại dữ liệu sau khi cập nhật
    next();
}

// Hàm kiểm tra tần suất truy cập
function checkRequestFrequency(req, res, next) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const requestPath = req.path;

    // Khởi tạo nếu chưa có đối tượng cho IP này
    if (!requestCounts[clientIp]) {
        requestCounts[clientIp] = {};
    }

    // Khởi tạo nếu chưa có đường dẫn này trong đối tượng IP
    if (!requestCounts[clientIp][requestPath]) {
        requestCounts[clientIp][requestPath] = {
            count: 0,
            timestamp: Date.now()
        };
    }

    const currentTime = Date.now();
    const timeDiff = currentTime - requestCounts[clientIp][requestPath].timestamp;

    // Nếu thời gian hiện tại đã vượt quá TIME_FRAME, reset count và timestamp
    if (timeDiff > TIME_FRAME) {
        requestCounts[clientIp][requestPath].count = 1; // Đếm lần đầu tiên
        requestCounts[clientIp][requestPath].timestamp = currentTime; // Cập nhật thời gian
    } else {
        // Nếu còn trong khoảng thời gian, tăng số lần truy cập
        requestCounts[clientIp][requestPath].count += 1;

        // Nếu số lần truy cập vượt quá giới hạn
        if (requestCounts[clientIp][requestPath].count > REQUEST_LIMIT) {
            return handleRateLimit(req, res);
        }
    }

    // Gọi middleware tiếp theo nếu chưa bị cấm
    next();
}

// Hàm xử lý khi vượt quá giới hạn request
function handleRateLimit(req, res) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Cấm IP trong 24 giờ (24 giờ tính bằng milliseconds)
    banIp(clientIp, 24 * 60 * 60 * 1000);

    return res.status(429).json({
        success: false,
        message: 'Too many requests, you have been banned for 24 hours.'
    });
}

module.exports = {
    checkBan,
    handleRateLimit,
    checkRequestFrequency,
    countRequest
};

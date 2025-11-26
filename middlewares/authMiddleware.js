

module.exports = async function (req, res, next) {
    
    const apiKey = req.query.apikey || req.headers['apikey']
    const database = global.db.database
    const collection = database.collection('users')
    const foundKey = await collection.findOne({ apikey: apiKey })
    
    if (foundKey) {
        if(foundKey.ban) {
            return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa!' });
        }

        req.role = foundKey.role;
        req.rlpp = foundKey.role == 0 ? Infinity : foundKey.role == 1 ? 5000 : 300;
        return next();
    }

    // Bỏ qua xác thực cho các route đặc biệt
    if (global.escapes.includes(req.path)) {
        
        req.role = 3
        return next();
    }

    // Trả về thông báo lỗi nếu apiKey không hợp lệ
    res.status(403).json({ success: false, message: 'API key không hợp lệ!' });
};

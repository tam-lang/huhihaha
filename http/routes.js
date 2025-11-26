const { authAdmin, authDev, authUser } = require("../middlewares/authWebtoken");
const {
  dashboard,
  login,
  loginProcess,
  signup,
  logout,
  showUsers,
  createUser,
  showEditUsers,
  storeUser,
  detailApi,
  signupProcess,
  verifyEmail,
  delUser,
  showEditProfile,
  saveEditProfile,
  overview,
  getFormForgotPassword,
  getPass,
  searchApi
} = require("./controller/userController");

const { showIPs, updateIPs } = require("./controller/IPsController");

module.exports = (app) => {
  app.use((req, res, next) => {
    res.locals.path = req.path;
    res.locals.baseUrl = req.protocol + "://" + req.get("host");
    res.locals.thisIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    next(); // Đừng quên gọi next() để tiếp tục xử lý middleware khác
  });

  app.get("/dashboard", authUser, dashboard);

  app.get("/login", login);

  app.post("/users/login", loginProcess);

  app.get("/signup", signup)

  app.post("/verify-email", verifyEmail);

  app.post("/signup-process", signupProcess);

  app.get("/forgot-password", getFormForgotPassword);

  app.post("/get-password", getPass)

  app.get("/logout", logout);

  app.get("/users", authAdmin, showUsers);

  app.post("/users/create", authDev, createUser);

  app.get("/users/edit/:id", authDev, showEditUsers);

  app.post("/users/update/:id", authDev, storeUser);

  app.post("/users/destroy/", authDev, delUser);

  app.get("/edit-profile", authUser, showEditProfile);

  app.post("/save-profile", authUser, saveEditProfile);

  app.get("/overview", authUser, overview);

  app.get("/detail-api/*", authUser, detailApi);

  app.get("/search", authUser, searchApi);

  app.get("/ips", authAdmin, showIPs);

  app.post("/ips/update/:ip", authDev, updateIPs);

  app.get("/notes/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const database = global.db.database;
      const ObjectId = global.db.ObjectId;
      const collection = database.collection("notes");
      const result = await collection.findOne({ _id: new ObjectId(id) });
      res.render("editorView", {layout: false, note: result});
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  });

  app.post("/notes/update/:id", async (req, res) => {
    const id = req.params.id;
    const data = req.body.data;
    if(!id) return res.json({ success: false, message: "Id không được trống" });
    if (!data)
      return res.json({ success: false, message: "Data Không được trống" });

    try {
      const database = global.db.database;
      const ObjectId = global.db.ObjectId;
      const collection = database.collection("notes");
      const result = await collection.updateOne({ _id: new ObjectId(id) }, { $set: { data } });
      return res.json({ success: true, data: result });
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  });
};

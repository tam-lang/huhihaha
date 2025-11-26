module.exports = async function (client) {

  if(!global.db?.database) {
    try {
      await client.connect();
      global.db.database = client.db("kairoApi");
      console.log("Connected to the database");
    } catch (error) {
      console.error(error);
      await disconnectFromDatabase();
      process.exit(0);
    }
  }
  

  async function disconnectFromDatabase() {
    try {
      await client.close();
      console.log("Disconnected from database.");
    } catch (error) {
      console.error("Error disconnecting from database:", error);
    }
  }

  // Xử lý tín hiệu dừng (SIGINT)
  process.on("SIGINT", async () => {
    await disconnectFromDatabase();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await disconnectFromDatabase();
    process.exit(0);
  });
  process.on("uncaughtException", async (err) => {
    console.error("Uncaught Exception:", err);
    await disconnectFromDatabase();
    process.exit(1);
  });
  process.on("exit", async (code) => {
    await disconnectFromDatabase();
    process.exit(code);
  });
  process.on("SIGUSR2", async () => {
    await disconnectFromDatabase(); // Kết nối đến cơ sở dữ liệu nếu cần
});

};

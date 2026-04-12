module.exports = (err, req, res, next) => {
  console.error(err);

  if (err?.code === 11000) {
    return res.status(409).json({ msg: "User already exists" });
  }

  if (err?.name === "ValidationError") {
    return res.status(400).json({ msg: err.message });
  }

  if (
    err?.name?.includes("Mongoose") &&
    /buffering timed out|ECONN|querySrv ETIMEOUT|failed to connect/i.test(err.message)
  ) {
    return res.status(503).json({
      msg: "Database connection issue. Verify MongoDB URI, IP whitelist, and internet access.",
    });
  }

  const status = err.statusCode || err.status || 500;
  return res.status(status).json({ msg: status === 500 ? "Server Error" : err.message });
};

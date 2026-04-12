const User = require("../models/User");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in environment variables");
}

// 🔐 Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign(
    { _id: userId },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const ensureDbReady = (res) => {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({
      msg: "Database not connected. Check MongoDB URI/network and try again.",
    });
    return false;
  }
  return true;
};

// 🟢 REGISTER
exports.register = async (req, res, next) => {
  try {
    if (!ensureDbReady(res)) return;

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ msg: "All fields required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ msg: "User already exists" });
    }

    const user = await User.create({ name: name.trim(), email: normalizedEmail, password });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });

  } catch (err) {
    next(err);
  }
};

// 🟢 LOGIN
exports.login = async (req, res, next) => {
  try {
    if (!ensureDbReady(res)) return;

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ msg: "Email and password required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }

    const match = await user.comparePassword(password);

    if (!match) {
      return res.status(401).json({ msg: "Invalid credentials" });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });

  } catch (err) {
    next(err);
  }
};

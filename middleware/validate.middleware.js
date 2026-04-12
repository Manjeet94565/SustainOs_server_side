module.exports = (req, res, next) => {
  let { building, water, energy } = req.body;

  /* ✅ CHECK EMPTY */
  if (!building || water === undefined || energy === undefined) {
    return res.status(400).json({
      success: false,
      msg: "All fields (building, water, energy) are required",
    });
  }

  /* ✅ TRIM BUILDING */
  building = building.trim();

  if (building.length < 2) {
    return res.status(400).json({
      success: false,
      msg: "Building name must be at least 2 characters",
    });
  }

  /* ✅ TYPE CONVERSION */
  water = Number(water);
  energy = Number(energy);

  /* ✅ VALID NUMBER CHECK */
  if (isNaN(water) || isNaN(energy)) {
    return res.status(400).json({
      success: false,
      msg: "Water and Energy must be valid numbers",
    });
  }

  /* ✅ NEGATIVE CHECK */
  if (water < 0 || energy < 0) {
    return res.status(400).json({
      success: false,
      msg: "Values cannot be negative",
    });
  }

  /* ✅ LIMIT CHECK (REALISTIC RANGE) */
  if (water > 100000 || energy > 10000) {
    return res.status(400).json({
      success: false,
      msg: "Values exceed realistic limits",
    });
  }

  /* ✅ CLEAN DATA BACK */
  req.body = {
    building,
    water,
    energy,
  };

  next();
};
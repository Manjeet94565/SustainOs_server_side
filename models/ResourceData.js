const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema({

 energy:{
  type:Number,
  required:true
 },

 water:{
  type:Number,
  required:true
 },

 carbon:{
  type:Number,
  required:true
 },

 date:{
  type:Date,
  default:Date.now
 }

});

module.exports = mongoose.model("ResourceData",resourceSchema);